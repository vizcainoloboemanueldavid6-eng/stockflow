import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { refreshDemoDataIfStale } from './sqlite-demo';

/**
 * PrismaClient factory shared by the app (src/lib/db.ts) and the Node scripts
 * (prisma/seed.ts). Deliberately free of `server-only` and Next.js imports so
 * plain `tsx` can load it.
 *
 * DATABASE_PROVIDER=sqlite (zero-external-service demo mode)
 *   The build creates and seeds prisma/sqlite/stockflow.db and ships it inside the
 *   serverless bundle. That location is read-only on Vercel, so at runtime the file
 *   is copied once per instance to os.tmpdir() and the client points at the copy.
 *   Each instance therefore starts from the seeded state (data resets on cold
 *   starts - see DECISIONS.md), re-seeded for the current day when the build's data
 *   has aged (src/lib/sqlite-demo.ts). Scripts (seed, reset) write to the bundled
 *   file and to the copy a running app is using.
 */
export type DatabaseProvider = 'postgresql' | 'sqlite';

export function databaseProvider(): DatabaseProvider {
  return (process.env.DATABASE_PROVIDER ?? '').trim().toLowerCase() === 'sqlite'
    ? 'sqlite'
    : 'postgresql';
}

export function bundledSqlitePath(): string {
  return path.join(process.cwd(), 'prisma', 'sqlite', 'stockflow.db');
}

/**
 * SQLite allows one writer at a time for the whole file. With a pool of several
 * connections, simultaneous transactions contend for the file lock inside the engine
 * and time out ("Socket timeout", P1008) - 32 of 40 simultaneous stock movements did.
 * One connection per process makes Prisma queue them instead (up to the transaction
 * maxWait), and each one takes milliseconds. `socket_timeout` (seconds) is how long a
 * query waits for a lock held by another process, e.g. a seed script.
 */
export function sqliteUrl(file: string): string {
  // Forward slashes keep Windows paths valid inside a file: URL.
  return `file:${file.replace(/\\/g, '/')}?connection_limit=1&socket_timeout=15`;
}

/**
 * Where the runtime copy of a bundled database lives. The name includes the file's
 * size and mtime, so rebuilding the database locally (`npm run db:sqlite`) is picked up
 * by the next server start.
 */
export function runtimeSqliteCopyPath(source = bundledSqlitePath()): string {
  if (!existsSync(source)) {
    throw new Error(
      `SQLite database not found at ${source}. Run \`npm run db:sqlite\` ` +
        '(or build with DATABASE_PROVIDER=sqlite) to create it.',
    );
  }
  const { size, mtimeMs } = statSync(source);
  return path.join(os.tmpdir(), 'stockflow', `stockflow-${size}-${Math.round(mtimeMs)}.db`);
}

/**
 * Copies the bundled database to a writable temp file (once per build of the file)
 * and returns the copy's path, and whether this call made it.
 */
export function prepareSqliteCopy(source = bundledSqlitePath()): {
  file: string;
  created: boolean;
} {
  const target = runtimeSqliteCopyPath(source);
  let created = false;
  if (!existsSync(target)) {
    mkdirSync(path.dirname(target), { recursive: true });
    // Copy then rename: concurrent workers never see a half-written file.
    const partial = `${target}.${process.pid}.${Date.now()}.tmp`;
    copyFileSync(source, partial);
    // copyFile keeps the source's permission bits. A deployment bundle can ship the file
    // read-only, and SQLite would then refuse every write ("attempt to write a readonly
    // database"), so the copy is always made writable.
    chmodSync(partial, 0o644);
    renameSync(partial, target);
    created = true;
  }
  return { file: target, created };
}

export function ensureWritableSqliteCopy(source = bundledSqlitePath()): string {
  return prepareSqliteCopy(source).file;
}

/**
 * Interactive transactions (every mutation) may wait up to 10 s for a connection and
 * run for up to 15 s. Prisma's defaults (2 s / 5 s) turned a burst of simultaneous stock
 * movements - more requests than the pool has connections, or a pool still opening its
 * connections - into "Unable to start a transaction in the given time" (P2028). A
 * movement takes milliseconds, so a longer wait only queues requests instead of failing
 * them; what still fails is reported as "busy" (toActionError in actions/guard.ts).
 */
export const transactionOptions = { maxWait: 10_000, timeout: 15_000 };

export function createPrismaClient({
  sqliteTarget = 'runtime-copy',
  sqliteSource = bundledSqlitePath(),
}: {
  /** 'runtime-copy' for the app, 'bundled' for scripts that build the shipped file. */
  sqliteTarget?: 'runtime-copy' | 'bundled';
  /** The bundled database file (tests point it elsewhere). */
  sqliteSource?: string;
} = {}): PrismaClient {
  const log: ('error' | 'warn')[] =
    process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

  if (databaseProvider() === 'sqlite') {
    if (sqliteTarget === 'bundled') {
      return new PrismaClient({ datasourceUrl: sqliteUrl(sqliteSource), log, transactionOptions });
    }
    const { file, created } = prepareSqliteCopy(sqliteSource);
    const client = new PrismaClient({ datasourceUrl: sqliteUrl(file), log, transactionOptions });
    // Only a copy made just now can hold the build's aged data; an existing one may hold
    // work done since (local development), and is left alone.
    return created ? withDemoRefresh(client, file) : client;
  }
  return new PrismaClient({ log, transactionOptions });
}

/**
 * Makes every query - and every transaction, before it takes SQLite's write lock - wait
 * until a fresh copy's demo data has been re-seeded for today when it had aged
 * (src/lib/sqlite-demo.ts). Once that is done the wait is a resolved promise.
 */
function withDemoRefresh(client: PrismaClient, file: string): PrismaClient {
  let ready: Promise<void> | undefined;
  const refresh = () => (ready ??= refreshCopy(file));
  const gated = client.$extends({
    query: {
      async $allOperations({ args, query }) {
        await refresh();
        return query(args);
      },
    },
  });
  return new Proxy(gated, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (property !== '$transaction' || typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        await refresh();
        return value.apply(target, args);
      };
    },
  }) as unknown as PrismaClient;
}

async function refreshCopy(file: string): Promise<void> {
  // Its own short-lived client, so the re-seed never waits for the app's one connection.
  const writer = new PrismaClient({
    datasourceUrl: sqliteUrl(file),
    log: ['error'],
    transactionOptions,
  });
  try {
    if (await refreshDemoDataIfStale(writer)) {
      console.info(`[sqlite] the demo data had aged; re-seeded it for today (${file})`);
    }
  } catch (error) {
    console.error('[sqlite] could not refresh the demo data; serving it as built', error);
  } finally {
    await writer.$disconnect();
  }
}
