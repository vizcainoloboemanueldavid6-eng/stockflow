/**
 * Seed CLI. Run through the npm scripts (they load .env and pick the provider):
 *   npm run db:seed        sample data + the three seeded accounts (keeps other users)
 *   npm run db:reset-demo  restore the whole database to the seed state
 * Flags: --reset-demo, --if-empty (skip when any user exists; used by the Vercel build)
 */
import { createPrismaClient, databaseProvider } from '../src/lib/prisma-client';
import { demoEnabled } from '../src/lib/config';
import { accountsToSeed, isDatabaseEmpty, seedDatabase } from '../src/lib/seed';

async function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has('--reset-demo') ? 'reset-demo' : 'seed';
  // Scripts write to the database file itself; the app uses a temp copy (SQLite mode).
  const prisma = createPrismaClient({ sqliteTarget: 'bundled' });

  try {
    if (args.has('--if-empty') && !(await isDatabaseEmpty(prisma))) {
      console.log('Database already has users - skipping seed (--if-empty).');
      return;
    }

    const started = Date.now();
    const summary = await seedDatabase(prisma, { mode });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log(
      `\n${mode === 'reset-demo' ? 'Demo reset' : 'Seed'} complete in ${seconds}s (${databaseProvider()}):`,
    );
    console.log(
      `  ${summary.users} seeded accounts${summary.removedUsers ? `, ${summary.removedUsers} other accounts removed` : ''}`,
    );
    console.log(
      `  ${summary.categories} categories, ${summary.suppliers} suppliers, ${summary.products} products`,
    );
    console.log(`  ${summary.movements} stock movements over the last 90 days`);
    console.log(`  ${summary.lowStock} products at or below their reorder level`);

    // The demo passwords are public; real ones (DEMO_ENABLED=false) never go to a log.
    const publicPasswords = demoEnabled();
    console.log('\nSign in with:');
    for (const account of Object.values(accountsToSeed())) {
      const password = publicPasswords ? account.password : '(password from your SEED_* variable)';
      console.log(`  ${account.role.padEnd(5)}  ${account.email.padEnd(24)}  ${password}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
