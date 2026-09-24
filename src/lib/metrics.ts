import { type MovementType, type StockStatus, stockStatus } from '@/lib/constants';
import { dayKey, type DayKey } from '@/lib/dates';

/**
 * Inventory arithmetic behind the dashboard and the reports. Pure: the queries in
 * src/lib/queries fetch plain rows (money already converted with toNumber()) and
 * these functions do the math, so it is unit-tested without a database.
 *
 * Money is summed in integer cents: 60 x 19.99 x 7 in floating point drifts,
 * cents do not.
 */

const toCents = (amount: number) => Math.round(amount * 100);

/** quantity x amount, in cents, for one line. */
export function lineValueCents(quantity: number, amount: number): number {
  return quantity * toCents(amount);
}

export type ValuedProduct = { quantity: number; unitCost: number; archived?: boolean };

/** Total inventory value at cost: sum of quantity x unitCost over non-archived products. */
export function inventoryValue(products: readonly ValuedProduct[]): number {
  let cents = 0;
  for (const product of products) {
    if (product.archived) continue;
    cents += lineValueCents(product.quantity, product.unitCost);
  }
  return cents / 100;
}

/** How many products are in each stock status. */
export function countByStatus(
  products: readonly { quantity: number; reorderLevel: number }[],
): Record<StockStatus, number> {
  const counts: Record<StockStatus, number> = { in_stock: 0, low_stock: 0, out_of_stock: 0 };
  for (const product of products) counts[stockStatus(product.quantity, product.reorderLevel)] += 1;
  return counts;
}

export type DailyFlow = { day: DayKey; in: number; out: number };

/**
 * Units received (IN) and sold (OUT) per calendar day, one entry per requested day
 * (zero-filled). Adjustments are corrections, not flow, so they are left out.
 */
export function dailyInOut(
  movements: readonly { type: MovementType; quantity: number; createdAt: Date }[],
  days: readonly DayKey[],
  timeZone: string,
): DailyFlow[] {
  const byDay = new Map<DayKey, DailyFlow>(days.map((day) => [day, { day, in: 0, out: 0 }]));
  for (const movement of movements) {
    if (movement.type === 'ADJUSTMENT') continue;
    const bucket = byDay.get(dayKey(movement.createdAt, timeZone));
    if (!bucket) continue;
    if (movement.type === 'IN') bucket.in += movement.quantity;
    else bucket.out += movement.quantity;
  }
  return days.map((day) => byDay.get(day)!);
}

export type ValuationProduct = {
  categoryId: string;
  quantity: number;
  unitCost: number;
  salePrice: number;
};

export type ValuationRow = {
  categoryId: string;
  name: string;
  color: string;
  products: number;
  units: number;
  costValue: number;
  retailValue: number;
  /** Share of the total cost value, 0..1. */
  share: number;
};

export type Valuation = {
  rows: ValuationRow[];
  totals: { products: number; units: number; costValue: number; retailValue: number };
};

/**
 * Stock valuation per category, at cost and at sale price. Every category appears
 * (an empty one with zeros); rows are sorted by cost value, largest first.
 * Pass only the products that count (the reports use non-archived ones).
 */
export function valuationByCategory(
  products: readonly ValuationProduct[],
  categories: readonly { id: string; name: string; color: string }[],
): Valuation {
  const acc = new Map(
    categories.map((category) => [
      category.id,
      { ...category, products: 0, units: 0, costCents: 0, retailCents: 0 },
    ]),
  );
  for (const product of products) {
    const row = acc.get(product.categoryId);
    if (!row) continue;
    row.products += 1;
    row.units += product.quantity;
    row.costCents += lineValueCents(product.quantity, product.unitCost);
    row.retailCents += lineValueCents(product.quantity, product.salePrice);
  }

  const all = [...acc.values()];
  const totalCost = all.reduce((sum, row) => sum + row.costCents, 0);
  const rows: ValuationRow[] = all
    .map((row) => ({
      categoryId: row.id,
      name: row.name,
      color: row.color,
      products: row.products,
      units: row.units,
      costValue: row.costCents / 100,
      retailValue: row.retailCents / 100,
      share: totalCost > 0 ? row.costCents / totalCost : 0,
    }))
    .sort((a, b) => b.costValue - a.costValue || a.name.localeCompare(b.name));

  return {
    rows,
    totals: {
      products: all.reduce((sum, row) => sum + row.products, 0),
      units: all.reduce((sum, row) => sum + row.units, 0),
      costValue: totalCost / 100,
      retailValue: all.reduce((sum, row) => sum + row.retailCents, 0) / 100,
    },
  };
}

/** Signed effect of a stored movement on stock (IN +, OUT -, ADJUSTMENT stored signed). */
export function movementDelta(type: MovementType, quantity: number): number {
  return type === 'OUT' ? -quantity : quantity;
}
