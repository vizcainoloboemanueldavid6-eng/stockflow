#!/usr/bin/env node
// Real PostgreSQL 16 without Docker, for local development and CI-like checks.
//
//   npm run db:local        start the server in the foreground (Ctrl+C stops it)
//   npm run db:local:stop   stop a server started from another terminal
//
// Data lives in .pg/data (git-ignored). Connection string:
//   postgresql://postgres:postgres@localhost:54329/stockflow
// docker-compose.yml offers the same thing for anyone who prefers Docker.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { ROOT } from './lib/common.mjs';

const PORT = Number(process.env.PG_LOCAL_PORT ?? 54329);
const DATA_DIR = path.join(ROOT, '.pg', 'data');
const DATABASE = 'stockflow';
const USER = 'postgres';
const PASSWORD = 'postgres';
const URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;

function pgCtlPath() {
  // The platform package that embedded-postgres installed carries pg_ctl next to postgres.
  const require = createRequire(import.meta.url);
  const pkgs = {
    win32: '@embedded-postgres/windows-x64',
    darwin:
      process.arch === 'arm64'
        ? '@embedded-postgres/darwin-arm64'
        : '@embedded-postgres/darwin-x64',
    linux:
      process.arch === 'arm64' ? '@embedded-postgres/linux-arm64' : '@embedded-postgres/linux-x64',
  };
  const pkgJson = require.resolve(`${pkgs[process.platform]}/package.json`);
  const exe = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  return path.join(path.dirname(pkgJson), 'native', 'bin', exe);
}

function stop() {
  if (!existsSync(path.join(DATA_DIR, 'postmaster.pid'))) {
    console.log('No local PostgreSQL server is running (no postmaster.pid).');
    return;
  }
  const result = spawnSync(pgCtlPath(), ['stop', '-D', DATA_DIR, '-m', 'fast'], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

async function start() {
  const pidFile = path.join(DATA_DIR, 'postmaster.pid');
  if (existsSync(pidFile)) {
    const pid = readFileSync(pidFile, 'utf8').split(/\r?\n/)[0];
    console.log(
      `A server already seems to be running on this data directory (postmaster.pid, PID ${pid}).\n` +
        'Stop it with `npm run db:local:stop` first, or delete .pg/data/postmaster.pid if it is stale.',
    );
    process.exit(1);
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
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

  if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    console.log(`Initialising a new cluster in ${path.relative(ROOT, DATA_DIR)} ...`);
    await pg.initialise();
  }

  await pg.start();

  const client = pg.getPgClient('postgres', 'localhost');
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    DATABASE,
  ]);
  if (!rowCount) await client.query(`CREATE DATABASE "${DATABASE}"`);
  await client.end();

  console.log(`\nPostgreSQL is ready on port ${PORT}.`);
  console.log(`DATABASE_URL="${URL}"`);
  console.log('\nNext: npm run db:deploy && npm run db:seed   (Ctrl+C to stop the server)\n');

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nStopping PostgreSQL ...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Keep the event loop alive; embedded-postgres runs the server as a child process.
  setInterval(() => {}, 1 << 30);
}

if (process.argv[2] === 'stop') {
  stop();
} else {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
