import { describe, expect, it } from 'vitest';
import { InsufficientStockError, NotFoundError, ValidationError } from '@/lib/errors';
import { createRng } from '@/lib/seed/generate';
import {
  adjustmentDeltaForCount,
  applyStockMovement,
  nextQuantity,
  signedDelta,
  type StockTx,
} from '@/lib/stock';

/**
 * In-memory stand-in for the slice of the Prisma transaction client used by
 * applyStockMovement(). Each call is atomic (like a single SQL statement) and
 * yields to the event loop first, so concurrent callers interleave the way
 * separate database transactions would.
 */
function createFakeDb(initial: { id: string; quantity: number; archived?: boolean }[]) {
  const products = new Map(
    initial.map((p) => [
      p.id,
      { sku: p.id.toUpperCase(), name: `Product ${p.id}`, reorderLevel: 5, archived: false, ...p },
    ]),
  );
  const movements: { id: string; productId: string; type: string; quantity: number }[] = [];
  const audits: { action: string; entityId: string | null }[] = [];
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  let seq = 0;

  type Where = { id: string; archived?: boolean; quantity?: { gte: number } };
  type Data = { quantity: { increment?: number; decrement?: number } };

  const tx = {
    product: {
      async updateMany({ where, data }: { where: Where; data: Data }) {
        await tick();
        const p = products.get(where.id);
        if (!p) return { count: 0 };
        if (where.archived !== undefined && p.archived !== where.archived) return { count: 0 };
        if (where.quantity && !(p.quantity >= where.quantity.gte)) return { count: 0 };
        p.quantity += (data.quantity.increment ?? 0) - (data.quantity.decrement ?? 0);
        return { count: 1 };
      },
      async findUnique({ where }: { where: { id: string } }) {
        await tick();
        const p = products.get(where.id);
        return p ? { ...p } : null;
      },
      async findUniqueOrThrow({ where }: { where: { id: string } }) {
        await tick();
        const p = products.get(where.id);
        if (!p) throw new Error('not found');
        return { ...p };
      },
    },
    stockMovement: {
      async create({
        data,
      }: {
        data: {
          productId: string;
          type: string;
          quantity: number;
          reason: string | null;
          userId: string | null;
        };
      }) {
        await tick();
        const row = { id: `m${++seq}`, createdAt: new Date(), ...data };
        movements.push(row);
        return row;
      },
    },
    auditLog: {
      async create({ data }: { data: { action: string; entityId: string | null } }) {
        await tick();
        audits.push(data);
        return data;
      },
    },
  };

  return { tx: tx as unknown as StockTx, products, movements, audits };
}

const signed = (m: { type: string; quantity: number }) =>
  m.type === 'OUT' ? -m.quantity : m.quantity;

describe('signedDelta / nextQuantity', () => {
  it('adds IN, subtracts OUT and applies ADJUSTMENT as a signed delta', () => {
    expect(signedDelta('IN', 5)).toBe(5);
    expect(signedDelta('OUT', 5)).toBe(-5);
    expect(signedDelta('ADJUSTMENT', -2)).toBe(-2);
    expect(signedDelta('ADJUSTMENT', 3)).toBe(3);
    expect(nextQuantity(10, 'OUT', 10)).toBe(0);
    expect(nextQuantity(0, 'IN', 4)).toBe(4);
  });

  it('never returns a negative quantity', () => {
    expect(() => nextQuantity(3, 'OUT', 4)).toThrow(InsufficientStockError);
    expect(() => nextQuantity(0, 'OUT', 1)).toThrow(InsufficientStockError);
    expect(() => nextQuantity(2, 'ADJUSTMENT', -3)).toThrow(InsufficientStockError);
  });

  it('explains the shortage in the error message', () => {
    expect(() => nextQuantity(3, 'OUT', 7)).toThrow(
      'Not enough stock: 3 available, tried to remove 7.',
    );
    try {
      nextQuantity(3, 'OUT', 7);
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStockError);
      expect(error).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        status: 409,
        available: 3,
        requested: 7,
      });
    }
  });

  it('rejects zero, negative and fractional quantities', () => {
    expect(() => signedDelta('IN', 0)).toThrow(ValidationError);
    expect(() => signedDelta('OUT', -1)).toThrow(ValidationError);
    expect(() => signedDelta('ADJUSTMENT', 0)).toThrow(ValidationError);
    expect(() => signedDelta('IN', 1.5)).toThrow(ValidationError);
    expect(() => signedDelta('IN', Number.NaN)).toThrow(ValidationError);
  });

  it('turns a physical count into an adjustment delta', () => {
    expect(adjustmentDeltaForCount(12, 9)).toBe(-3);
    expect(adjustmentDeltaForCount(0, 4)).toBe(4);
    expect(() => adjustmentDeltaForCount(5, -1)).toThrow(ValidationError);
  });
});

describe('applyStockMovement', () => {
  it('updates the quantity and records the movement and an audit entry', async () => {
    const db = createFakeDb([{ id: 'p1', quantity: 10 }]);
    const result = await applyStockMovement(db.tx, {
      productId: 'p1',
      type: 'OUT',
      quantity: 4,
      reason: '  Online order ',
      userId: 'u1',
    });
    expect(result.product.quantity).toBe(6);
    expect(result.delta).toBe(-4);
    expect(db.products.get('p1')?.quantity).toBe(6);
    expect(db.movements).toEqual([
      expect.objectContaining({
        productId: 'p1',
        type: 'OUT',
        quantity: 4,
        reason: 'Online order',
        userId: 'u1',
      }),
    ]);
    expect(db.audits).toEqual([
      expect.objectContaining({ action: 'stock.out', entityId: result.movement.id }),
    ]);
  });

  it('stores ADJUSTMENT quantities signed', async () => {
    const db = createFakeDb([{ id: 'p1', quantity: 10 }]);
    await applyStockMovement(db.tx, {
      productId: 'p1',
      type: 'ADJUSTMENT',
      quantity: -3,
      userId: 'u1',
    });
    expect(db.movements[0]).toMatchObject({ type: 'ADJUSTMENT', quantity: -3 });
    expect(db.products.get('p1')?.quantity).toBe(7);
  });

  it('refuses to overdraw and leaves everything untouched', async () => {
    const db = createFakeDb([{ id: 'p1', quantity: 3 }]);
    await expect(
      applyStockMovement(db.tx, { productId: 'p1', type: 'OUT', quantity: 5, userId: 'u1' }),
    ).rejects.toThrow('Not enough stock: 3 available, tried to remove 5.');
    await expect(
      applyStockMovement(db.tx, {
        productId: 'p1',
        type: 'ADJUSTMENT',
        quantity: -4,
        userId: 'u1',
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(db.products.get('p1')?.quantity).toBe(3);
    expect(db.movements).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
  });

  it('reports unknown and archived products precisely', async () => {
    const db = createFakeDb([{ id: 'old', quantity: 9, archived: true }]);
    await expect(
      applyStockMovement(db.tx, { productId: 'missing', type: 'IN', quantity: 1, userId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      applyStockMovement(db.tx, { productId: 'old', type: 'OUT', quantity: 1, userId: null }),
    ).rejects.toThrow(/archived/);
    expect(db.products.get('old')?.quantity).toBe(9);
  });

  it('lets only as many concurrent OUTs succeed as the stock allows', async () => {
    const db = createFakeDb([{ id: 'p1', quantity: 10 }]);
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        applyStockMovement(db.tx, { productId: 'p1', type: 'OUT', quantity: 3, userId: 'u1' }),
      ),
    );
    const succeeded = attempts.filter((a) => a.status === 'fulfilled');
    const failed = attempts.filter((a) => a.status === 'rejected');
    expect(succeeded).toHaveLength(3);
    expect(failed).toHaveLength(3);
    for (const failure of failed) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);
    }
    expect(db.products.get('p1')?.quantity).toBe(1);
    expect(db.movements).toHaveLength(3);
  });

  it('keeps stock non-negative and equal to the movement ledger under random load', async () => {
    const rng = createRng(42);
    const db = createFakeDb([
      { id: 'a', quantity: 0 },
      { id: 'b', quantity: 0 },
      { id: 'c', quantity: 0 },
    ]);
    const ids = ['a', 'b', 'c'];
    let rejected = 0;

    for (let round = 0; round < 60; round++) {
      const batch = Array.from({ length: 8 }, () => {
        const roll = rng.next();
        const type = roll < 0.3 ? 'IN' : roll < 0.85 ? 'OUT' : 'ADJUSTMENT';
        const quantity = type === 'ADJUSTMENT' ? rng.pick([-4, -2, -1, 1, 2]) : rng.int(1, 6);
        return applyStockMovement(db.tx, {
          productId: rng.pick(ids),
          type,
          quantity,
          userId: 'u1',
        });
      });
      const results = await Promise.allSettled(batch);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(InsufficientStockError);
          rejected++;
        }
      }
      for (const id of ids) expect(db.products.get(id)?.quantity).toBeGreaterThanOrEqual(0);
    }

    expect(rejected).toBeGreaterThan(0); // the scenario really did try to overdraw
    for (const id of ids) {
      const ledger = db.movements
        .filter((m) => m.productId === id)
        .reduce((sum, m) => sum + signed(m), 0);
      expect(db.products.get(id)?.quantity).toBe(ledger);
    }
  });
});
