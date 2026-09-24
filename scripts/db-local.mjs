#!/usr/bin/env node
// Real PostgreSQL 16 without Docker, for local development and CI-like checks.
//
//   npm run db:local        start the server in the foreground (Ctrl+C stops it)
//   npm run db:local:stop   stop a server started from another terminal
//
// Data lives in .pg/data (git-ignored). Connection string:
//   postgresql://postgres:postgres@localhost:54329/stockflow
// docker-compose.yml offers the same thing for anyone who prefers Docker.
import { existsSync } from 'node:fs';
import {
  PG_PID_FILE,
  PG_PORT,
  localDatabaseUrl,
  shutdownLocalPostgres,
  startLocalPostgres,
  stopLocalPostgres,
} from './lib/local-postgres.mjs';

async function start() {
  const pg = await startLocalPostgres();

  console.log(`\nPostgreSQL is ready on port ${PG_PORT}.`);
  console.log(`DATABASE_URL="${localDatabaseUrl()}"`);
  console.log('\nNext: npm run db:deploy && npm run db:seed   (Ctrl+C to stop the server)\n');

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nStopping PostgreSQL ...');
    await shutdownLocalPostgres(pg);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Keep the event loop alive while the server runs, and exit once it is stopped from
  // elsewhere (`npm run db:local:stop` removes postmaster.pid).
  setInterval(() => {
    if (!stopping && !existsSync(PG_PID_FILE)) {
      console.log('PostgreSQL was stopped.');
      process.exit(0);
    }
  }, 2000);
}

const task = process.argv[2] === 'stop' ? stopLocalPostgres().then(process.exit) : start();
task.catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
