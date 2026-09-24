import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InsufficientStockError } from '@/lib/errors';
import { createPrismaClient, databaseProvider } from '@/lib/prisma-client';
import { seedDatabase } from '@/lib/seed';
import { applyStockMovement } from '@/lib/stock';

/*
 * Runs against the real database configured in .env (PostgreSQL by default, or the
 * SQLite file with DATABASE_PROVIDER=sqlite). WARNING: it re-seeds the database.
 *   npm run db:local            # PostgreSQL on :54329, in another terminal
 *   npm run db:deploy && npm run test:integration
 */
let prisma: PrismaClient;
const signed = (m: { type: string; quantity: number }) =>
  m.type === 'OUT' ? -m.quantity : m.quantity;

beforeAll(async () => {
  prisma = createPrismaClient({ sqliteTarget: 'bundled' });
  await seedDatabase(prisma, { mode: 'reset-demo' });
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe(`seed on ${databaseProvider()}`, () => {
  it('loads the spec-sized data set', async () => {
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.category.count()).toBe(6);
    expect(await prisma.supplier.count()).toBe(5);
    expect(await prisma.product.count()).toBe(60);
    expect(await prisma.stockMovement.count()).toBe(400);
    const roles = (await prisma.user.findMany({ select: { role: true } }))
      .map((u) => u.role)
      .sort();
    expect(roles).toEqual(['ADMIN', 'DEMO', 'STAFF']);
  });

  it('stores quantities that match the movement ledger and are never negative', async () => {
    const products = await prisma.product.findMany({
      select: { id: true, quantity: true, movements: { select: { type: true, quantity: true } } },
    });
    for (const product of products) {
      expect(product.quantity).toBeGreaterThanOrEqual(0);
      expect(product.quantity).toBe(product.movements.reduce((sum, m) => sum + signed(m), 0));
    }
  });

  it('flags several products at or below their reorder level', async () => {
    const low = await prisma.product.count({
      where: { archived: false, quantity: { lte: prisma.product.fields.reorderLevel } },
    });
    expect(low).toBeGreaterThanOrEqual(5);
  });

  it('is idempotent and removes visitor accounts on reset-demo', async () => {
    await prisma.user.create({
      data: { name: 'Visitor', email: 'visitor@example.test', passwordHash: 'x', role: 'STAFF' },
    });
    const first = await seedDatabase(prisma, { mode: 'reset-demo' });
    const second = await seedDatabase(prisma, { mode: 'reset-demo' });
    expect(first.removedUsers).toBe(1);
    expect(second.removedUsers).toBe(0);
    expect({ ...second, removedUsers: 0 }).toEqual({ ...first, removedUsers: 0 });
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.stockMovement.count()).toBe(400);
  });
});

describe('applyStockMovement against the real database', () => {
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    const category = await prisma.category.findFirstOrThrow({ select: { id: true } });
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    userId = admin.id;
    const product = await prisma.product.create({
      data: {
        sku: 'TEST-CONCURRENCY',
        name: 'Concurrency test item',
        categoryId: category.id,
        unitCost: 1,
        salePrice: 2,
        reorderLevel: 1,
      },
      select: { id: true },
    });
    productId = product.id;
    await prisma.$transaction((tx) =>
      applyStockMovement(tx, { productId, type: 'IN', quantity: 10, userId, reason: 'Test stock' }),
    );
  });

  afterAll(async () => {
    const movements = await prisma.stockMovement.findMany({
      where: { productId },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: movements.map((m) => m.id) } } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
  });

  it('never lets concurrent OUTs overdraw the stock', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        prisma.$transaction((tx) =>
          applyStockMovement(tx, { productId, type: 'OUT', quantity: 3, userId }),
        ),
      ),
    );
    const ok = attempts.filter((a) => a.status === 'fulfilled').length;
    const rejected = attempts.filter((a) => a.status === 'rejected') as PromiseRejectedResult[];
    // SQLite serialises writers and may report "database is locked" under load;
    // PostgreSQL must reject exactly the overdrawing ones with a stock error.
    if (databaseProvider() === 'postgresql') {
      expect(ok).toBe(3);
      for (const r of rejected) expect(r.reason).toBeInstanceOf(InsufficientStockError);
    } else {
      expect(ok).toBeLessThanOrEqual(3);
    }
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.quantity).toBe(10 - ok * 3);
    expect(await prisma.stockMovement.count({ where: { productId, type: 'OUT' } })).toBe(ok);
  });

  it('two overlapping OUTs cannot both take the same units', async () => {
    // Deterministic interleaving: the first transaction takes 7 of 10 units and holds
    // its row lock; the second asks for 7 more while the first is still open.
    const start = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    if (start.quantity !== 10) {
      await prisma.$transaction((tx) =>
        applyStockMovement(tx, {
          productId,
          type: 'ADJUSTMENT',
          quantity: 10 - start.quantity,
          userId,
          reason: 'Set to 10 for the test',
        }),
      );
    }

    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    let signalApplied!: () => void;
    const applied = new Promise<void>((resolve) => (signalApplied = resolve));
    const options = { timeout: 30_000, maxWait: 10_000 };

    const first = prisma.$transaction(async (tx) => {
      const result = await applyStockMovement(tx, { productId, type: 'OUT', quantity: 7, userId });
      signalApplied();
      await hold; // keep the transaction (and its row lock) open
      return result;
    }, options);
    await applied;

    const second = prisma.$transaction(
      (tx) => applyStockMovement(tx, { productId, type: 'OUT', quantity: 7, userId }),
      options,
    );

    if (databaseProvider() === 'postgresql') {
      // Wait until the second transaction is really blocked on the first one's row lock.
      const deadline = Date.now() + 10_000;
      for (;;) {
        const [{ waiting }] = await prisma.$queryRawUnsafe<{ waiting: number }[]>(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        if (waiting > 0) break;
        if (Date.now() > deadline) throw new Error('the second OUT never waited for the lock');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    release();

    const [a, b] = await Promise.allSettled([first, second]);
    expect(a.status).toBe('fulfilled');
    const quantity = (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .quantity;
    if (databaseProvider() === 'postgresql') {
      // READ COMMITTED re-checks `quantity >= 7` on the committed row (3 units): no match.
      expect(b.status).toBe('rejected');
      const reason = (b as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(InsufficientStockError);
      expect(reason.message).toBe('Not enough stock: 3 available, tried to remove 7.');
      expect(quantity).toBe(3);
    } else {
      // SQLite has one writer at a time: the second transaction either waits and then
      // finds 3 units (InsufficientStockError) or gives up on the lock. Never both.
      expect(b.status).toBe('rejected');
      expect(quantity).toBe(3);
    }
  });

  it('rolls back everything when a movement is refused', async () => {
    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const movements = await prisma.stockMovement.count({ where: { productId } });
    await expect(
      prisma.$transaction((tx) =>
        applyStockMovement(tx, { productId, type: 'OUT', quantity: before.quantity + 1, userId }),
      ),
    ).rejects.toThrow(
      `Not enough stock: ${before.quantity} available, tried to remove ${before.quantity + 1}.`,
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).quantity).toBe(
      before.quantity,
    );
    expect(await prisma.stockMovement.count({ where: { productId } })).toBe(movements);
  });

  it.runIf(databaseProvider() === 'postgresql')(
    'is backed by a CHECK constraint in PostgreSQL',
    async () => {
      await expect(
        prisma.product.update({ where: { id: productId }, data: { quantity: -1 } }),
      ).rejects.toThrow();
    },
  );
});
