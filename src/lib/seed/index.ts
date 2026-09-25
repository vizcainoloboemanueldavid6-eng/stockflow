import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { demoEnabled, seedAccounts } from '@/lib/config';
import { SEED_CATEGORIES, SEED_SUPPLIERS } from './catalog';
import { generateSeedData, type SeedUserKey } from './generate';

/**
 * Writes the sample data set. Shared by `npm run db:seed`, `npm run db:reset-demo`,
 * the SQLite demo build and the daily cron (/api/cron/reset-demo).
 *
 * mode 'seed'        wipes business data (products, movements, categories, suppliers,
 *                    audit log), upserts the three seeded accounts, keeps other users.
 * mode 'reset-demo'  same, and also deletes every account that is not one of the
 *                    three seeded ones: the demo deployment returns to a known state.
 *
 * Idempotent: running it twice gives the same result (dates are relative to now).
 * Everything runs in one transaction, so visitors never see a half-reset database.
 */
export type SeedMode = 'seed' | 'reset-demo';

export type SeedSummary = {
  mode: SeedMode;
  users: number;
  categories: number;
  suppliers: number;
  products: number;
  movements: number;
  lowStock: number;
  removedUsers: number;
};

/**
 * The accounts to create. With the public demo on: admin, staff and demo, with their
 * published default passwords unless overridden. With DEMO_ENABLED=false (a real
 * deployment): no demo account, and the admin and staff passwords must come from
 * SEED_ADMIN_PASSWORD / SEED_STAFF_PASSWORD - the defaults are printed in the README.
 */
export function accountsToSeed(env: Record<string, string | undefined> = process.env) {
  const accounts = seedAccounts();
  if (demoEnabled()) return accounts;

  const missing = ['SEED_ADMIN_PASSWORD', 'SEED_STAFF_PASSWORD'].filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(
      `DEMO_ENABLED=false marks a real deployment, but ${missing.join(' and ')} ` +
        `${missing.length > 1 ? 'are' : 'is'} not set, so the seeded accounts would get the ` +
        'passwords published in the README. Set both variables and run the seed again.',
    );
  }
  const { admin, staff } = accounts;
  return { admin, staff };
}

export async function seedDatabase(
  prisma: PrismaClient,
  { mode, now = new Date() }: { mode: SeedMode; now?: Date },
): Promise<SeedSummary> {
  const accounts: Partial<ReturnType<typeof seedAccounts>> = accountsToSeed();
  const keys = (Object.keys(accounts) as SeedUserKey[]).filter((key) => accounts[key]);
  const { products, movements } = generateSeedData({ now });

  // Hash outside the transaction: bcrypt is CPU work, not database work.
  const hashes = Object.fromEntries(
    await Promise.all(
      keys.map(async (key) => [key, await bcrypt.hash(accounts[key]!.password, 10)] as const),
    ),
  ) as Record<SeedUserKey, string>;

  return prisma.$transaction(
    async (tx) => {
      await tx.auditLog.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.product.deleteMany();
      await tx.category.deleteMany();
      await tx.supplier.deleteMany();

      const userIds = {} as Partial<Record<SeedUserKey, string>>;
      for (const key of keys) {
        const account = accounts[key]!;
        const user = await tx.user.upsert({
          where: { email: account.email },
          create: {
            name: account.name,
            email: account.email,
            role: account.role,
            passwordHash: hashes[key],
          },
          update: { name: account.name, role: account.role, passwordHash: hashes[key] },
          select: { id: true },
        });
        userIds[key] = user.id;
      }

      let removedUsers = 0;
      if (mode === 'reset-demo') {
        const removed = await tx.user.deleteMany({
          where: { id: { notIn: Object.values(userIds) } },
        });
        removedUsers = removed.count;
      } else if (!accounts.demo) {
        // Demo switched off: a demo account left from an earlier seed must not survive.
        const removed = await tx.user.deleteMany({
          where: { role: 'DEMO', email: seedAccounts().demo.email },
        });
        removedUsers = removed.count;
      }

      const categories = await tx.category.createManyAndReturn({
        data: SEED_CATEGORIES.map(({ name, color }) => ({ name, color })),
        select: { id: true, name: true },
      });
      const categoryId = new Map(
        SEED_CATEGORIES.map((c) => [c.key, categories.find((row) => row.name === c.name)?.id]),
      );

      const suppliers = await tx.supplier.createManyAndReturn({
        data: SEED_SUPPLIERS.map(({ name, email, phone, notes }) => ({
          name,
          email,
          phone,
          notes,
        })),
        select: { id: true, name: true },
      });
      const supplierId = new Map(
        SEED_SUPPLIERS.map((s) => [s.key, suppliers.find((row) => row.name === s.name)?.id]),
      );

      const createdProducts = await tx.product.createManyAndReturn({
        data: products.map((p) => {
          const category = categoryId.get(p.category);
          if (!category) throw new Error(`Unknown category "${p.category}" for ${p.sku}`);
          return {
            sku: p.sku,
            name: p.name,
            description: p.description,
            categoryId: category,
            supplierId: supplierId.get(p.supplier) ?? null,
            unitCost: p.unitCost,
            salePrice: p.salePrice,
            // Equals the sum of this product's generated movements (see generate.ts).
            quantity: p.quantity,
            reorderLevel: p.reorderLevel,
            createdAt: p.createdAt,
          };
        }),
        select: { id: true, sku: true },
      });
      const productId = new Map(createdProducts.map((p) => [p.sku, p.id]));

      await tx.stockMovement.createMany({
        data: movements.map((m) => {
          const id = productId.get(m.sku);
          if (!id) throw new Error(`Movement for unknown SKU ${m.sku}`);
          return {
            productId: id,
            type: m.type,
            quantity: m.quantity,
            reason: m.reason,
            // Without a demo account its share of the history goes to the staff account.
            userId: userIds[m.user] ?? userIds.staff,
            createdAt: m.createdAt,
          };
        }),
      });

      await tx.auditLog.create({
        data: {
          userId: null,
          action: mode === 'reset-demo' ? 'system.demo-reset' : 'system.seed',
          entity: 'System',
          entityId: null,
          // The moment the data set's relative dates were generated for (see sqlite-demo.ts).
          createdAt: now,
        },
      });

      return {
        mode,
        users: Object.keys(userIds).length,
        categories: categories.length,
        suppliers: suppliers.length,
        products: createdProducts.length,
        movements: movements.length,
        lowStock: products.filter((p) => p.quantity <= p.reorderLevel).length,
        removedUsers,
      };
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}

/** True when the database has no users yet (used by `seed --if-empty` on first deploy). */
export async function isDatabaseEmpty(prisma: PrismaClient): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}
