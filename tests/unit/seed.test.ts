import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES, SEED_PRODUCTS, SEED_SUPPLIERS } from '@/lib/seed/catalog';
import { generateSeedData, SEED_HISTORY_DAYS, SEED_MOVEMENT_TOTAL } from '@/lib/seed/generate';

const now = new Date('2026-09-24T15:30:00');
const { products, movements } = generateSeedData({ now });
const signed = (m: { type: string; quantity: number }) =>
  m.type === 'OUT' ? -m.quantity : m.quantity;

describe('seed catalogue', () => {
  it('has the sizes the spec asks for', () => {
    expect(SEED_CATEGORIES).toHaveLength(6);
    expect(SEED_SUPPLIERS).toHaveLength(5);
    expect(SEED_PRODUCTS).toHaveLength(60);
    expect(products).toHaveLength(60);
    expect(movements).toHaveLength(SEED_MOVEMENT_TOTAL);
    expect(SEED_MOVEMENT_TOTAL).toBe(400);
  });

  it('uses unique SKUs and names and sells above cost', () => {
    expect(new Set(products.map((p) => p.sku)).size).toBe(60);
    expect(new Set(products.map((p) => p.name)).size).toBe(60);
    for (const p of products) expect(p.salePrice, p.name).toBeGreaterThan(p.unitCost);
  });
});

describe('generated history', () => {
  it('never takes a product below zero at any point in time', () => {
    const ordered = [...movements].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const running = new Map<string, number>();
    for (const m of ordered) {
      const next = (running.get(m.sku) ?? 0) + signed(m);
      expect(next, `${m.sku} at ${m.createdAt.toISOString()}`).toBeGreaterThanOrEqual(0);
      running.set(m.sku, next);
    }
  });

  it('ends every product at exactly the sum of its movements', () => {
    for (const p of products) {
      const ledger = movements
        .filter((m) => m.sku === p.sku)
        .reduce((sum, m) => sum + signed(m), 0);
      expect(p.quantity, p.sku).toBe(ledger);
      expect(p.quantity).toBeGreaterThanOrEqual(0);
    }
  });

  it('stays inside the last 90 days and never in the future', () => {
    const earliest = new Date(now);
    earliest.setHours(0, 0, 0, 0);
    earliest.setDate(earliest.getDate() - (SEED_HISTORY_DAYS - 1));
    for (const m of movements) {
      expect(m.createdAt.getTime()).toBeGreaterThanOrEqual(earliest.getTime());
      expect(m.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('looks like a shop: mostly sales, some restocks, a few adjustments, activity today', () => {
    const count = (type: string) => movements.filter((m) => m.type === type).length;
    expect(count('OUT')).toBeGreaterThan(count('IN'));
    expect(count('OUT')).toBeGreaterThan(200);
    expect(count('ADJUSTMENT')).toBeGreaterThan(10);
    expect(movements.every((m) => m.type !== 'ADJUSTMENT' || m.quantity !== 0)).toBe(true);
    expect(movements.every((m) => m.type === 'ADJUSTMENT' || m.quantity > 0)).toBe(true);

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    expect(movements.filter((m) => m.createdAt >= today).length).toBeGreaterThanOrEqual(3);

    const last30 = new Date(today);
    last30.setDate(last30.getDate() - 29);
    const recentOut = movements.filter((m) => m.type === 'OUT' && m.createdAt >= last30).length;
    expect(recentOut).toBeGreaterThan(60); // enough points for the 30-day chart
  });

  it('leaves several products at or below their reorder level', () => {
    const low = products.filter((p) => p.quantity <= p.reorderLevel);
    expect(low.length).toBeGreaterThanOrEqual(5);
    expect(low.length).toBeLessThanOrEqual(20);
  });

  it('has clear best sellers for the top-5 chart', () => {
    const sold = new Map<string, number>();
    for (const m of movements)
      if (m.type === 'OUT') sold.set(m.sku, (sold.get(m.sku) ?? 0) + m.quantity);
    const ranking = [...sold.values()].sort((a, b) => b - a);
    expect(ranking[0]).toBeGreaterThan((ranking[9] ?? 0) * 1.5);
  });

  it('is deterministic', () => {
    const again = generateSeedData({ now });
    expect(again.movements).toEqual(movements);
    expect(again.products.map((p) => [p.sku, p.quantity])).toEqual(
      products.map((p) => [p.sku, p.quantity]),
    );
  });
});
