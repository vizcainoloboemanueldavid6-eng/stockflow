import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { InsufficientStockError } from '@/lib/errors';
import { appTimeZone, dayKey, startOfDay } from '@/lib/dates';
import {
  bundledSqlitePath,
  createPrismaClient,
  databaseProvider,
  runtimeSqliteCopyPath,
  sqliteUrl,
} from '@/lib/prisma-client';
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
    // PostgreSQL: READ COMMITTED re-checks `quantity >= 7` on the committed row (3 units)
    // and matches nothing. SQLite: one writer at a time, so the second transaction only
    // runs once the first has committed, and finds 3 units. Same outcome either way.
    expect(b.status).toBe('rejected');
    const reason = (b as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(InsufficientStockError);
    expect(reason.message).toBe('Not enough stock: 3 available, tried to remove 7.');
    expect(quantity).toBe(3);
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

describe('seed with DEMO_ENABLED=false (a real deployment)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    // Leave the database as the other suites expect it: the public demo data set.
    await seedDatabase(prisma, { mode: 'reset-demo' });
  });

  it('refuses to give the seeded accounts the passwords published in the README', async () => {
    vi.stubEnv('DEMO_ENABLED', 'false');
    vi.stubEnv('SEED_ADMIN_PASSWORD', '');
    vi.stubEnv('SEED_STAFF_PASSWORD', 'Private#Staff2026');
    await expect(seedDatabase(prisma, { mode: 'seed' })).rejects.toThrow(
      /SEED_ADMIN_PASSWORD is not set/,
    );
    // Nothing was written: the demo account from the earlier seed is still there.
    expect(await prisma.user.count({ where: { role: 'DEMO' } })).toBe(1);
  });

  it('creates no demo account, removes an existing one and keeps the history whole', async () => {
    vi.stubEnv('DEMO_ENABLED', 'false');
    vi.stubEnv('SEED_ADMIN_PASSWORD', 'Private#Admin2026');
    vi.stubEnv('SEED_STAFF_PASSWORD', 'Private#Staff2026');
    const summary = await seedDatabase(prisma, { mode: 'seed' });
    expect(summary.users).toBe(2);
    const users = await prisma.user.findMany({ select: { role: true, passwordHash: true } });
    expect(users.map((u) => u.role).sort()).toEqual(['ADMIN', 'STAFF']);
    const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    expect(await bcrypt.compare('Private#Admin2026', admin.passwordHash)).toBe(true);
    expect(await bcrypt.compare('Admin#2026', admin.passwordHash)).toBe(false);
    expect(await prisma.stockMovement.count()).toBe(400);
    expect(await prisma.stockMovement.count({ where: { userId: null } })).toBe(0);
  });
});

describe.runIf(databaseProvider() === 'sqlite')('SQLite demo: a new copy of aged data', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'stockflow-aged-'));
  const cleanup: string[] = [];

  afterAll(() => {
    for (const file of cleanup) rmSync(file, { force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  /** A bundled database whose data was seeded a month ago, like a build left alone. */
  async function agedSource(name: string): Promise<string> {
    const source = path.join(dir, name);
    copyFileSync(bundledSqlitePath(), source);
    const aged = new PrismaClient({ datasourceUrl: sqliteUrl(source) });
    await seedDatabase(aged, { mode: 'reset-demo', now: new Date(Date.now() - 31 * DAY) });
    await aged.$disconnect();
    cleanup.push(runtimeSqliteCopyPath(source));
    return source;
  }

  const recent = () => ({ createdAt: { gte: new Date(Date.now() - 30 * DAY) } });
  const today = () => {
    const zone = appTimeZone();
    return { createdAt: { gte: startOfDay(dayKey(new Date(), zone), zone) } };
  };

  it('is re-seeded for today before the first query; a restart keeps the copy as is', async () => {
    const source = await agedSource('aged-a.db');
    const app = createPrismaClient({ sqliteSource: source });
    // Without the refresh the last 30 days would be empty: the data ends 31 days ago.
    expect(await app.stockMovement.count({ where: recent() })).toBeGreaterThan(100);
    expect(await app.stockMovement.count({ where: today() })).toBeGreaterThanOrEqual(3);
    await app.supplier.create({ data: { name: 'Added after the refresh' } });
    await app.$disconnect();

    const restarted = createPrismaClient({ sqliteSource: source });
    expect(await restarted.supplier.count({ where: { name: 'Added after the refresh' } })).toBe(1);
    await restarted.$disconnect();
  });

  it('also when the first thing the app does is a transaction', async () => {
    const source = await agedSource('aged-b.db');
    const app = createPrismaClient({ sqliteSource: source });
    const count = await app.$transaction((tx) => tx.stockMovement.count({ where: recent() }));
    expect(count).toBeGreaterThan(100);
    await app.$disconnect();
  });
});
