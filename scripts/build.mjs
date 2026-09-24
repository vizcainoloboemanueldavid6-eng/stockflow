#!/usr/bin/env node
// `npm run build`: prepares the database layer for DATABASE_PROVIDER, then runs `next build`.
//
// PostgreSQL (default)
//   - prisma generate
//   - on Vercel only (VERCEL=1): prisma migrate deploy, then seed if the database has no users,
//     so the first deployment against an empty Neon database comes up with demo data.
//
// SQLite (DATABASE_PROVIDER=sqlite) - the zero-external-service demo mode
//   - derives prisma/sqlite/schema.prisma, generates the SQLite client,
//     creates prisma/sqlite/stockflow.db and seeds it;
//   - next.config.ts ships that file inside every serverless function
//     (outputFileTracingIncludes) and src/lib/prisma-client.ts copies it to os.tmpdir()
//     on first use, because the deployment filesystem is read-only.
import {
  buildSqliteDatabase,
  generateClient,
  getProvider,
  loadEnv,
  next,
  prisma,
  tsx,
} from './lib/common.mjs';

loadEnv();

const provider = getProvider();
const onVercel = process.env.VERCEL === '1';

try {
  console.log(`[build] database provider: ${provider}${onVercel ? ' (Vercel)' : ''}`);

  if (provider === 'sqlite') {
    buildSqliteDatabase({ seed: true });
  } else {
    generateClient('postgresql');
    if (onVercel) {
      if (!process.env.DATABASE_URL) {
        throw new Error(
          'DATABASE_URL is not set. Add your Neon connection string in the Vercel project ' +
            'settings, or set DATABASE_PROVIDER=sqlite for the self-contained demo mode.',
        );
      }
      prisma(['migrate', 'deploy']);
      tsx(['prisma/seed.ts', '--if-empty']);
    }
  }

  next(['build'], { env: { DATABASE_PROVIDER: provider } });
} catch (error) {
  console.error(`\n[build] ${error.message}`);
  process.exit(1);
}
