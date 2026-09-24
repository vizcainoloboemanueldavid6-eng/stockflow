// Embedded PostgreSQL 16 (the `embedded-postgres` package): a real server without Docker.
// Shared by `npm run db:local` (scripts/db-local.mjs) and the e2e database
// (scripts/e2e-db.mjs). Data lives in .pg/data (git-ignored).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { ROOT } from './common.mjs';

export const PG_PORT = Number(process.env.PG_LOCAL_PORT ?? 54329);
export const PG_DATA_DIR = path.join(ROOT, '.pg', 'data');
export const PG_PID_FILE = path.join(PG_DATA_DIR, 'postmaster.pid');
const USER = 'postgres';
const PASSWORD = 'postgres';

/** Connection string for a database on the local server. */
export function localDatabaseUrl(database = 'stockflow') {
  return `postgresql://${USER}:${PASSWORD}@localhost:${PG_PORT}/${database}`;
}

/** True when something accepts TCP connections on the port. */
export function isPortOpen(port = PG_PORT, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1500, () => done(false));
  });
}

/** pg_ctl from the platform package that embedded-postgres installed (it exports the path). */
export async function pgCtlPath() {
  const packages = {
    win32: '@embedded-postgres/windows-x64',
    darwin: `@embedded-postgres/darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`,
    linux: `@embedded-postgres/linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}`,
  };
  const { pg_ctl } = await import(packages[process.platform]);
  return pg_ctl;
}

/** Stops the server on .pg/data with `pg_ctl stop -m fast`. Returns pg_ctl's exit code. */
export async function stopLocalPostgres({ quiet = false } = {}) {
  if (!existsSync(PG_PID_FILE)) {
    if (!quiet) console.log('No local PostgreSQL server is running (no postmaster.pid).');
    return 0;
  }
  const result = spawnSync(await pgCtlPath(), ['stop', '-D', PG_DATA_DIR, '-m', 'fast'], {
    stdio: quiet ? 'ignore' : 'inherit',
  });
  return result.status ?? 1;
}

/**
 * Stops a server this process started. `pg_ctl stop -m fast` first: on Windows the
 * embedded-postgres `stop()` terminates the process abruptly and leaves postmaster.pid
 * behind, while pg_ctl shuts it down cleanly on every platform.
 */
export async function shutdownLocalPostgres(pg) {
  const code = await stopLocalPostgres({ quiet: true });
  if (code !== 0) await pg.stop().catch(() => {});
}

/**
 * Starts the server (initialising .pg/data on first use) and makes sure the
 * `stockflow` database exists. A postmaster.pid left behind by a killed server is
 * removed when nothing is listening on the port; a live one is an error.
 * Returns the EmbeddedPostgres instance (call `.stop()` to shut it down).
 */
export async function startLocalPostgres({ database = 'stockflow' } = {}) {
  if (existsSync(PG_PID_FILE)) {
    const pid = readFileSync(PG_PID_FILE, 'utf8').split(/\r?\n/)[0];
    if (await isPortOpen()) {
      throw new Error(
        `A server already seems to be running on this data directory (postmaster.pid, PID ${pid}).\n` +
          'Stop it with `npm run db:local:stop` first.',
      );
    }
    console.log(`Removing a stale postmaster.pid (PID ${pid}, nothing listens on ${PG_PORT}).`);
    rmSync(PG_PID_FILE, { force: true });
  }

  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir: PG_DATA_DIR,
    port: PG_PORT,
    user: USER,
    password: PASSWORD,
    authMethod: 'scram-sha-256',
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: (message) => {
      const text = String(message ?? '').trim();
      if (text) console.error(`[postgres] ${text}`);
    },
  });

  if (!existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) {
    console.log(`Initialising a new cluster in ${path.relative(ROOT, PG_DATA_DIR)} ...`);
    await pg.initialise();
  }

  await pg.start();

  const client = pg.getPgClient('postgres', 'localhost');
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    database,
  ]);
  if (!rowCount) await client.query(`CREATE DATABASE "${database}"`);
  await client.end();

  return pg;
}
