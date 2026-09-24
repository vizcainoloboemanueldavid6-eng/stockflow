import { describe, expect, it } from 'vitest';
import {
  countByStatus,
  dailyInOut,
  inventoryValue,
  lineValueCents,
  movementDelta,
  valuationByCategory,
} from '@/lib/metrics';

describe('inventoryValue (KPI)', () => {
  it('sums quantity x unit cost', () => {
    expect(
      inventoryValue([
        { quantity: 10, unitCost: 2.5 },
        { quantity: 3, unitCost: 19.99 },
        { quantity: 0, unitCost: 100 },
      ]),
    ).toBe(84.97);
  });

  it('leaves archived products out', () => {
    expect(
      inventoryValue([
        { quantity: 10, unitCost: 1 },
        { quantity: 99, unitCost: 50, archived: true },
      ]),
    ).toBe(10);
  });

  it('does not drift like floating point sums', () => {
    const products = Array.from({ length: 60 }, () => ({ quantity: 7, unitCost: 0.1 }));
    // 60 x 7 x 0.10 = 42.00 exactly; a naive float sum gives 42.00000000000003.
    expect(inventoryValue(products)).toBe(42);
    expect(lineValueCents(3, 19.99)).toBe(5997);
  });

  it('is zero for an empty catalogue', () => {
    expect(inventoryValue([])).toBe(0);
  });
});

describe('countByStatus', () => {
  it('uses the shared stock-status rule (low = at or below reorder level)', () => {
    expect(
      countByStatus([
        { quantity: 0, reorderLevel: 5 },
        { quantity: 5, reorderLevel: 5 },
        { quantity: 6, reorderLevel: 5 },
        { quantity: 0, reorderLevel: 0 },
        { quantity: 1, reorderLevel: 0 },
      ]),
    ).toEqual({ out_of_stock: 2, low_stock: 1, in_stock: 2 });
  });
});

describe('dailyInOut', () => {
  const zone = 'America/Bogota';
  const days = ['2026-09-22', '2026-09-23', '2026-09-24'];

  it('buckets units per calendar day in the zone and zero-fills', () => {
    const flow = dailyInOut(
      [
        { type: 'IN', quantity: 20, createdAt: new Date('2026-09-22T15:00:00Z') },
        { type: 'OUT', quantity: 3, createdAt: new Date('2026-09-22T16:00:00Z') },
        // 02:00 UTC on the 24th is still the 23rd in Bogota (UTC-5).
        { type: 'OUT', quantity: 4, createdAt: new Date('2026-09-24T02:00:00Z') },
        { type: 'OUT', quantity: 1, createdAt: new Date('2026-09-24T12:00:00Z') },
      ],
      days,
      zone,
    );
    expect(flow).toEqual([
      { day: '2026-09-22', in: 20, out: 3 },
      { day: '2026-09-23', in: 0, out: 4 },
      { day: '2026-09-24', in: 0, out: 1 },
    ]);
  });

  it('ignores adjustments and movements outside the window', () => {
    const flow = dailyInOut(
      [
        { type: 'ADJUSTMENT', quantity: -2, createdAt: new Date('2026-09-23T15:00:00Z') },
        { type: 'IN', quantity: 9, createdAt: new Date('2026-09-01T15:00:00Z') },
      ],
      days,
      zone,
    );
    expect(flow.every((day) => day.in === 0 && day.out === 0)).toBe(true);
  });
});

describe('valuationByCategory', () => {
  const categories = [
    { id: 'a', name: 'Audio', color: '#8B5CF6' },
    { id: 'c', name: 'Cables', color: '#0EA5E9' },
    { id: 'e', name: 'Empty', color: '#64748B' },
  ];

  it('values stock at cost and retail per category, largest first, with shares', () => {
    const valuation = valuationByCategory(
      [
        { categoryId: 'c', quantity: 10, unitCost: 2, salePrice: 5 },
        { categoryId: 'a', quantity: 2, unitCost: 30, salePrice: 60 },
        { categoryId: 'a', quantity: 1, unitCost: 20, salePrice: 45 },
      ],
      categories,
    );
    expect(valuation.rows.map((row) => row.name)).toEqual(['Audio', 'Cables', 'Empty']);
    expect(valuation.rows[0]).toMatchObject({
      products: 2,
      units: 3,
      costValue: 80,
      retailValue: 165,
      share: 0.8,
    });
    expect(valuation.rows[2]).toMatchObject({ products: 0, units: 0, costValue: 0, share: 0 });
    expect(valuation.totals).toEqual({ products: 3, units: 13, costValue: 100, retailValue: 215 });
    const shares = valuation.rows.reduce((sum, row) => sum + row.share, 0);
    expect(shares).toBeCloseTo(1, 10);
  });

  it('handles an empty inventory without dividing by zero', () => {
    const valuation = valuationByCategory([], categories);
    expect(valuation.totals.costValue).toBe(0);
    expect(valuation.rows.every((row) => row.share === 0)).toBe(true);
  });
});

describe('movementDelta', () => {
  it('turns stored movements into signed stock changes', () => {
    expect(movementDelta('IN', 5)).toBe(5);
    expect(movementDelta('OUT', 5)).toBe(-5);
    expect(movementDelta('ADJUSTMENT', -2)).toBe(-2);
  });
});
