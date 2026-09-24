import type { MovementType } from '@/lib/constants';
import { nextQuantity } from '@/lib/stock';
import { SEED_CATEGORIES, SEED_PRODUCTS, type SeedCatalogProduct } from './catalog';

/**
 * Deterministic sample-history generator (pure: no database, no Date.now()).
 *
 * Given the same `now` and `seed` it always returns the same 60 products and 400
 * movements. The history is *simulated* in chronological order with the same
 * rule the app enforces (nextQuantity() from src/lib/stock.ts), so:
 *   - no product ever goes below zero at any point in its history;
 *   - each product's final quantity equals the sum of its signed movements;
 *   - sales (OUT) dominate, best sellers sell most, restocks (IN) go to the
 *     products that are running low, and a few popular lines are deliberately
 *     not reordered in the last weeks, so several products end below their
 *     reorder level for the dashboard alerts.
 */

export const SEED_MOVEMENT_TOTAL = 400;
export const SEED_HISTORY_DAYS = 90;
const OUT_COUNT = 262;
const IN_COUNT = 52; // restocks, in addition to the 60 opening-stock receipts
const ADJUSTMENT_COUNT = SEED_MOVEMENT_TOTAL - SEED_PRODUCTS.length - OUT_COUNT - IN_COUNT; // 26
const SALES_SKEW = 1.3;
/** Reorder level = this many days of expected sales. */
const REORDER_COVER_DAYS = 28;
/** Restocks top a product up to this multiple of its reorder level. */
const ORDER_UP_TO = 3.5;
/** Popular lines left without reorders for the final weeks (they end low or out of stock). */
const NO_RESTOCK_WINDOW_DAYS = 28;
const NO_RESTOCK_COUNT = 8;
const LATE_DEMAND_BOOST = 8;

export type SeedUserKey = 'admin' | 'staff' | 'demo';

export type GeneratedProduct = SeedCatalogProduct & {
  sku: string;
  reorderLevel: number;
  /** Opening stock received on the first day of the history. */
  opening: number;
  quantity: number;
  createdAt: Date;
};

export type GeneratedMovement = {
  sku: string;
  type: MovementType;
  /** Positive for IN/OUT; signed delta for ADJUSTMENT. */
  quantity: number;
  reason: string;
  user: SeedUserKey;
  createdAt: Date;
};

export type GeneratedSeed = { products: GeneratedProduct[]; movements: GeneratedMovement[] };

/** mulberry32: tiny, fast, good-enough PRNG with a 32-bit seed. */
export function createRng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    weighted: <T>(items: readonly T[], weight: (item: T) => number): T => {
      const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll < 0) return item;
      }
      return items[items.length - 1] as T;
    },
  };
}

type Rng = ReturnType<typeof createRng>;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(now: Date, days: number): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() - days);
  return d;
}

/** A business-hours timestamp on the given day, never later than `now`. */
function timestampOn(rng: Rng, dayStart: Date, now: Date, fromHour = 8, toHour = 19): Date {
  const minutes = fromHour * 60 + rng.int(0, (toHour - fromHour) * 60 - 1);
  const time = new Date(dayStart.getTime() + minutes * 60_000 + rng.int(0, 59) * 1000);
  if (time <= now) return time;
  // Today, but that hour has not happened yet: spread over the part of today that has.
  const elapsed = now.getTime() - dayStart.getTime();
  return new Date(dayStart.getTime() + Math.floor(rng.next() * Math.max(1, elapsed)));
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * An OUT row is one recorded sale event: a till batch at closing time, an online
 * order, or a business order - so sizes range from one unit to a couple dozen.
 */
const SALE_REASONS = [
  'In-store sales',
  'In-store sales',
  'Online order',
  'Online order',
  'Phone order',
];

/** Units in one sale event for a product: from half its typical sale to double it. */
function saleRange(p: { maxPerSale: number }): [number, number] {
  return [Math.max(1, Math.ceil(p.maxPerSale / 2)), p.maxPerSale * 2];
}
const ADJUSTMENT_DOWN = [
  'Damaged in storage',
  'Stock count correction',
  'Display unit written off',
];
const ADJUSTMENT_UP = [
  'Stock count correction',
  'Customer return, resaleable',
  'Found during stock count',
];

/** Sales weight: popularity with a mild power so best sellers clearly lead. */
const salesWeight = (p: { popularity: number }) => p.popularity ** SALES_SKEW;

/** Round to values a person would type: exact below 10, then multiples of 5. */
function niceRound(value: number): number {
  return value < 10 ? Math.round(value) : Math.round(value / 5) * 5;
}

export function generateSeedData({
  now = new Date(),
  seed = 20_260_924,
}: { now?: Date; seed?: number } = {}): GeneratedSeed {
  const rng = createRng(seed);
  const prefixByCategory = new Map(SEED_CATEGORIES.map((c) => [c.key, c.skuPrefix]));
  const counters = new Map<string, number>();
  const totalWeight = SEED_PRODUCTS.reduce((sum, p) => sum + salesWeight(p), 0);

  const openingDay = daysAgo(now, SEED_HISTORY_DAYS - 1);
  const products: GeneratedProduct[] = SEED_PRODUCTS.map((product) => {
    const prefix = prefixByCategory.get(product.category) ?? 'GEN';
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    // Expected units sold per day, from this product's share of all sales.
    const perDay =
      (((OUT_COUNT * salesWeight(product)) / totalWeight) *
        (saleRange(product)[0] + saleRange(product)[1])) /
      2 /
      SEED_HISTORY_DAYS;
    const reorderLevel = Math.max(3, niceRound(perDay * REORDER_COVER_DAYS));
    return {
      ...product,
      sku: `${prefix}-${String(100 + n)}`,
      reorderLevel,
      opening: Math.round(reorderLevel * (3 + rng.next())),
      quantity: 0,
      createdAt: new Date(openingDay.getTime() + 7 * 3_600_000 + n * 60_000),
    };
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const movements: GeneratedMovement[] = [];
  const apply = (product: GeneratedProduct, movement: Omit<GeneratedMovement, 'sku'>) => {
    // Same rule as the app: throws if the movement would take stock below zero.
    product.quantity = nextQuantity(product.quantity, movement.type, movement.quantity);
    movements.push({ sku: product.sku, ...movement });
  };

  // 1. Opening stock: one receipt per product on the first day.
  for (const product of products) {
    apply(product, {
      type: 'IN',
      quantity: product.opening,
      reason: 'Opening stock',
      user: 'admin',
      createdAt: timestampOn(rng, openingDay, now, 8, 12),
    });
  }

  // 2. Timestamps for the other movements: busier recently (the shop is growing)
  //    and on Saturdays, quieter on Sundays.
  const dayWeights: { day: number; weight: number }[] = [];
  for (let day = 0; day < SEED_HISTORY_DAYS - 1; day++) {
    const date = daysAgo(now, day);
    const trend = 1.35 - (day / SEED_HISTORY_DAYS) * 0.7;
    const weekday = date.getDay();
    const weekly = weekday === 6 ? 1.35 : weekday === 0 ? 0.6 : 1;
    dayWeights.push({ day, weight: trend * weekly });
  }
  const eventCount = OUT_COUNT + IN_COUNT + ADJUSTMENT_COUNT;
  const times: Date[] = [];
  // Guarantee a little activity today so the "movements today" KPI is never empty.
  for (let i = 0; i < 3; i++) times.push(timestampOn(rng, daysAgo(now, 0), now));
  while (times.length < eventCount) {
    const { day } = rng.weighted(dayWeights, (d) => d.weight);
    times.push(timestampOn(rng, daysAgo(now, day), now));
  }
  times.sort((a, b) => a.getTime() - b.getTime());

  const types = shuffle(rng, [
    ...Array<MovementType>(OUT_COUNT).fill('OUT'),
    ...Array<MovementType>(IN_COUNT).fill('IN'),
    ...Array<MovementType>(ADJUSTMENT_COUNT).fill('ADJUSTMENT'),
  ]);

  // Popular lines that will not be reordered during the final weeks.
  const noRestock = new Set(
    [...products]
      .sort((a, b) => b.popularity - a.popularity || a.sku.localeCompare(b.sku))
      .filter((_, index) => index % 3 === 1)
      .slice(0, NO_RESTOCK_COUNT)
      .map((p) => p.sku),
  );
  const noRestockFrom = daysAgo(now, NO_RESTOCK_WINDOW_DAYS).getTime();
  let purchaseOrder = 1040;

  // 3. Simulate the history in order.
  times.forEach((createdAt, index) => {
    let type = types[index] as MovementType;
    const inStock = products.filter((p) => p.quantity > 0);
    if (type === 'OUT' && inStock.length === 0) type = 'IN';

    if (type === 'OUT') {
      // In the final weeks the lines that are not being reordered sell briskly
      // until they drop below their reorder level: those are the dashboard alerts.
      const late = createdAt.getTime() >= noRestockFrom;
      const product = rng.weighted(inStock, (p) =>
        late && noRestock.has(p.sku) && p.quantity > p.reorderLevel
          ? salesWeight(p) * LATE_DEMAND_BOOST
          : salesWeight(p),
      );
      const [low, high] = saleRange(product);
      const wholesale = product.maxPerSale >= 4 && rng.next() < 0.06;
      const wanted = wholesale ? rng.int(high + 2, high * 2) : rng.int(low, high);
      apply(product, {
        type: 'OUT',
        quantity: Math.min(wanted, product.quantity),
        reason: wholesale ? 'Business order' : rng.pick(SALE_REASONS),
        user: rng.weighted<SeedUserKey>(['staff', 'admin', 'demo'], (u) =>
          u === 'staff' ? 6 : u === 'admin' ? 3 : 1,
        ),
        createdAt,
      });
      return;
    }

    if (type === 'IN') {
      // Reorder the line that is lowest relative to its reorder level (a purchase
      // order is raised for the most urgent line first).
      const eligible = products.filter(
        (p) => !(noRestock.has(p.sku) && createdAt.getTime() >= noRestockFrom),
      );
      const ratio = (p: GeneratedProduct) => p.quantity / Math.max(1, p.reorderLevel);
      const product = eligible.reduce((low, p) => (ratio(p) < ratio(low) ? p : low));
      const target = Math.ceil(product.reorderLevel * ORDER_UP_TO);
      const units = Math.max(5, Math.ceil((target - product.quantity + rng.int(0, 4)) / 5) * 5);
      apply(product, {
        type: 'IN',
        quantity: units,
        reason: `Purchase order PO-${purchaseOrder++}`,
        user: rng.next() < 0.65 ? 'admin' : 'staff',
        createdAt,
      });
      return;
    }

    // ADJUSTMENT: mostly small write-downs, sometimes a count finds extra units.
    const product = rng.pick(products);
    let delta = rng.next() < 0.7 ? -rng.int(1, 3) : rng.int(1, 2);
    if (product.quantity + delta < 0) delta = product.quantity > 0 ? -product.quantity : 1;
    apply(product, {
      type: 'ADJUSTMENT',
      quantity: delta,
      reason: delta < 0 ? rng.pick(ADJUSTMENT_DOWN) : rng.pick(ADJUSTMENT_UP),
      user: rng.next() < 0.7 ? 'admin' : 'staff',
      createdAt,
    });
  });

  // Sanity: the lookups below must still agree with the simulation.
  if (bySku.size !== products.length) throw new Error('Duplicate SKU in the seed catalogue');

  return { products, movements };
}
