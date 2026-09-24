import { copyFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

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
 *   starts - see DECISIONS.md). Scripts (seed, reset) write to the bundled file.
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

function sqliteUrl(file: string): string {
  // Forward slashes keep Windows paths valid inside a file: URL.
  return `file:${file.replace(/\\/g, '/')}`;
}

/**
 * Copies the bundled database to a writable temp file (once per build of the file)
 * and returns the copy's path. The name includes size and mtime, so rebuilding the
 * database locally (`npm run db:sqlite`) is picked up by the next server start.
 */
export function ensureWritableSqliteCopy(source = bundledSqlitePath()): string {
  if (!existsSync(source)) {
    throw new Error(
      `SQLite database not found at ${source}. Run \`npm run db:sqlite\` ` +
        '(or build with DATABASE_PROVIDER=sqlite) to create it.',
    );
  }
  const { size, mtimeMs } = statSync(source);
  const dir = path.join(os.tmpdir(), 'stockflow');
  const target = path.join(dir, `stockflow-${size}-${Math.round(mtimeMs)}.db`);
  if (!existsSync(target)) {
    mkdirSync(dir, { recursive: true });
    // Copy then rename: concurrent workers never see a half-written file.
    const partial = `${target}.${process.pid}.${Date.now()}.tmp`;
    copyFileSync(source, partial);
    renameSync(partial, target);
  }
  return target;
}

export function createPrismaClient({
  sqliteTarget = 'runtime-copy',
}: {
  /** 'runtime-copy' for the app, 'bundled' for scripts that build the shipped file. */
  sqliteTarget?: 'runtime-copy' | 'bundled';
} = {}): PrismaClient {
  const log: ('error' | 'warn')[] =
    process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

  if (databaseProvider() === 'sqlite') {
    const file = sqliteTarget === 'bundled' ? bundledSqlitePath() : ensureWritableSqliteCopy();
    return new PrismaClient({ datasourceUrl: sqliteUrl(file), log });
  }
  return new PrismaClient({ log });
}
