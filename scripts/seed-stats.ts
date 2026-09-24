// Prints what the deterministic seed generator produces (for tuning; not shipped in the app).
// Usage: npx tsx scripts/seed-stats.ts
import { generateSeedData } from '../src/lib/seed/generate';

const now = new Date();
const { products, movements } = generateSeedData({ now });
const sold = new Map<string, number>();
const restocked = new Map<string, number>();
for (const m of movements) {
  if (m.type === 'OUT') sold.set(m.sku, (sold.get(m.sku) ?? 0) + m.quantity);
  if (m.type === 'IN' && m.reason !== 'Opening stock')
    restocked.set(m.sku, (restocked.get(m.sku) ?? 0) + 1);
}
const rows = products
  .map((p) => ({
    sku: p.sku,
    name: p.name.slice(0, 32),
    qty: p.quantity,
    reorder: p.reorderLevel,
    sold: sold.get(p.sku) ?? 0,
    restocks: restocked.get(p.sku) ?? 0,
    low: p.quantity <= p.reorderLevel ? (p.quantity === 0 ? 'OUT' : 'LOW') : '',
  }))
  .sort((a, b) => b.sold - a.sold);
console.table(rows);
const counts = { IN: 0, OUT: 0, ADJUSTMENT: 0 } as Record<string, number>;
for (const m of movements) counts[m.type] = (counts[m.type] ?? 0) + 1;
console.log(counts, 'low:', rows.filter((r) => r.low).length);
const today = new Date(now);
today.setHours(0, 0, 0, 0);
console.log('today:', movements.filter((m) => m.createdAt >= today).length);
const value = products.reduce((sum, p) => sum + p.quantity * p.unitCost, 0);
console.log('inventory value at cost:', value.toFixed(2));
