#!/usr/bin/env node
// Database for `npm run test:e2e` - the first webServer in playwright.config.ts.
//
// PostgreSQL (default)
//   - E2E_DATABASE_URL set: uses that database as is (e.g. Docker Compose).
//   - otherwise: the embedded PostgreSQL 16 on :54329 (started here when nothing listens
//     there, reused when `npm run db:local` is already running) and a separate
//     `stockflow_e2e` database, so the tests never touch your development data.
//   Then: prisma migrate deploy + the demo reset (seed data, only the three seeded
//   accounts), so every run starts from exactly the same freshly seeded state.
// SQLite (DATABASE_PROVIDER=sqlite)
//   - rebuilds and seeds prisma/sqlite/stockflow.db; the app works on a temp copy.
//
// When ready it answers GET http://127.0.0.1:<E2E_DB_READY_PORT>/ready (Playwright waits
// for it) and keeps running. GET /shutdown (sent by tests/e2e/global-teardown.ts) stops
// the PostgreSQL server gracefully if this script started it - on Windows Playwright can
// only force-kill its web servers.
import http from 'node:http';
import { buildSqliteDatabase, getProvider, loadEnv, prisma, tsx } from './lib/common.mjs';
import { isPortOpen, localDatabaseUrl, startLocalPostgres } from './lib/local-postgres.mjs';

loadEnv();

const READY_PORT = Number(process.env.E2E_DB_READY_PORT ?? 3119);
const provider = getProvider();
let server = null; // EmbeddedPostgres instance when this script started PostgreSQL

async function prepare() {
  if (provider === 'sqlite') {
    buildSqliteDatabase({ seed: true });
    return 'SQLite (prisma/sqlite/stockflow.db)';
  }

  const url = process.env.E2E_DATABASE_URL || localDatabaseUrl('stockflow_e2e');
  if (!process.env.E2E_DATABASE_URL && !(await isPortOpen())) {
    console.log('[e2e-db] starting the embedded PostgreSQL server ...');
    server = await startLocalPostgres();
  }
  const env = { DATABASE_URL: url, DATABASE_PROVIDER: 'postgresql' };
  prisma(['migrate', 'deploy'], { env });
  tsx(['prisma/seed.ts', '--reset-demo'], { env });
  return url.replace(/:[^:@/]+@/, ':***@');
}

async function shutdown() {
  if (!server) return;
  const running = server;
  server = null;
  console.log('[e2e-db] stopping PostgreSQL ...');
  await running.stop();
}

try {
  const target = await prepare();
  http
    .createServer(async (request, response) => {
      if (request.url === '/shutdown') {
        await shutdown().catch((error) => console.error('[e2e-db]', error));
        response.end('stopped');
        return;
      }
      response.end(`ready: ${target}`);
    })
    .listen(READY_PORT, '127.0.0.1', () => {
      console.log(`[e2e-db] database ready (${target}); waiting on :${READY_PORT}`);
    });

  const stopAndExit = () => shutdown().finally(() => process.exit(0));
  process.on('SIGINT', stopAndExit);
  process.on('SIGTERM', stopAndExit);
} catch (error) {
  console.error(`[e2e-db] ${error instanceof Error ? error.message : error}`);
  await shutdown().catch(() => {});
  process.exit(1);
}
