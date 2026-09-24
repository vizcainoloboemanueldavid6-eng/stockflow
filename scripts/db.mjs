#!/usr/bin/env node
// Provider-aware database commands. Usage: node scripts/db.mjs <command>
//
//   generate    Prisma Client for DATABASE_PROVIDER (postgresql by default, or sqlite)
//   push        Sync the schema without a migration (prototyping only)
//   seed        Reset business data and (re)create the admin, staff and demo accounts
//   reset-demo  Restore the whole database to the seed state (what the daily cron does)
//   sqlite      Build and seed the local SQLite database (prisma/sqlite/stockflow.db)
import {
  MAIN_SCHEMA,
  SQLITE_DB,
  SQLITE_SCHEMA,
  buildSqliteDatabase,
  generateClient,
  getProvider,
  loadEnv,
  prisma,
  tsx,
  writeSqliteSchema,
} from './lib/common.mjs';

loadEnv();

const [command, ...rest] = process.argv.slice(2);
const provider = getProvider();

function requirePostgresUrl() {
  if (!process.env.DATABASE_URL) {
    console.error(
      '\nDATABASE_URL is not set. Copy .env.example to .env and point it at a PostgreSQL\n' +
        'database (npm run db:local starts one on port 54329), or use SQLite mode:\n' +
        'set DATABASE_PROVIDER=sqlite and run npm run db:sqlite.\n',
    );
    process.exit(1);
  }
}

try {
  switch (command) {
    case 'generate':
      generateClient(provider);
      break;

    case 'push':
      if (provider === 'sqlite') {
        writeSqliteSchema();
        prisma(['db', 'push', `--schema=${SQLITE_SCHEMA}`]);
      } else {
        requirePostgresUrl();
        prisma(['db', 'push', `--schema=${MAIN_SCHEMA}`]);
      }
      break;

    case 'seed':
      if (provider !== 'sqlite') requirePostgresUrl();
      tsx(['prisma/seed.ts', ...rest]);
      break;

    case 'reset-demo':
      if (provider !== 'sqlite') requirePostgresUrl();
      tsx(['prisma/seed.ts', '--reset-demo', ...rest]);
      break;

    case 'sqlite':
      buildSqliteDatabase({ seed: true });
      console.log(`\nSQLite database ready: ${SQLITE_DB}`);
      if (provider !== 'sqlite') {
        console.log(
          'Set DATABASE_PROVIDER=sqlite in .env before `npm run dev`. To go back to PostgreSQL,\n' +
            'set it to postgresql and run `npm run db:generate` (the Prisma Client is provider-specific).',
        );
      }
      break;

    default:
      console.error(`Unknown command "${command ?? ''}". See the header of scripts/db.mjs.`);
      process.exit(1);
  }
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
