import 'server-only';
import { type StockStatus, stockStatus } from '@/lib/constants';
import { appTimeZone, lastDays, startOfDay } from '@/lib/dates';
import { lowStockWhere, prisma, toNumber } from '@/lib/db';
import { countByStatus, type DailyFlow, dailyInOut, inventoryValue } from '@/lib/metrics';

/** Length of the dashboard's trend window and of the "best sellers" window. */
export const DASHBOARD_WINDOW_DAYS = 30;
const LOW_STOCK_ROWS = 10;
const TOP_PRODUCTS = 5;

export type LowStockRow = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  reorderLevel: number;
  status: StockStatus;
  supplierName: string | null;
};

export type TopProduct = { id: string; name: string; sku: string; unitsSold: number };

export type DashboardData = {
  kpis: {
    inventoryValue: number;
    unitsOnHand: number;
    products: number;
    categories: number;
    lowStock: number;
    outOfStock: number;
    movementsToday: number;
    unitsInToday: number;
    unitsOutToday: number;
  };
  flow: DailyFlow[];
  flowTotals: { in: number; out: number };
  topProducts: TopProduct[];
  lowStock: LowStockRow[];
};

/**
 * Everything the dashboard shows, in parallel queries. "Today" and the 30 daily
 * buckets are calendar days in the app time zone; the chart and the best-seller
 * ranking cover the same 30 days (today included).
 */
export async function getDashboardData(now = new Date()): Promise<DashboardData> {
  const timeZone = appTimeZone();
  const days = lastDays(now, DASHBOARD_WINDOW_DAYS, timeZone);
  const windowStart = startOfDay(days[0]!, timeZone);
  const todayStart = startOfDay(days[days.length - 1]!, timeZone);

  const [products, categories, recent, movementsToday, top, lowStock] = await Promise.all([
    prisma.product.findMany({
      where: { archived: false },
      select: { quantity: true, unitCost: true, reorderLevel: true },
    }),
    prisma.category.count(),
    prisma.stockMovement.findMany({
      where: { createdAt: { gte: windowStart }, type: { in: ['IN', 'OUT'] } },
      select: { type: true, quantity: true, createdAt: true },
    }),
    prisma.stockMovement.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { type: 'OUT', createdAt: { gte: windowStart } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: TOP_PRODUCTS,
    }),
    prisma.product.findMany({
      where: lowStockWhere(),
      orderBy: [{ quantity: 'asc' }, { name: 'asc' }],
      take: LOW_STOCK_ROWS,
      select: {
        id: true,
        sku: true,
        name: true,
        quantity: true,
        reorderLevel: true,
        supplier: { select: { name: true } },
      },
    }),
  ]);

  const topNames = await prisma.product.findMany({
    where: { id: { in: top.map((row) => row.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const nameById = new Map(topNames.map((product) => [product.id, product]));

  const flow = dailyInOut(recent, days, timeZone);
  const today = flow[flow.length - 1]!;
  const statusCounts = countByStatus(products);

  return {
    kpis: {
      inventoryValue: inventoryValue(
        products.map((product) => ({
          quantity: product.quantity,
          unitCost: toNumber(product.unitCost),
        })),
      ),
      unitsOnHand: products.reduce((sum, product) => sum + product.quantity, 0),
      products: products.length,
      categories,
      lowStock: statusCounts.low_stock + statusCounts.out_of_stock,
      outOfStock: statusCounts.out_of_stock,
      movementsToday,
      unitsInToday: today.in,
      unitsOutToday: today.out,
    },
    flow,
    flowTotals: flow.reduce((sum, day) => ({ in: sum.in + day.in, out: sum.out + day.out }), {
      in: 0,
      out: 0,
    }),
    topProducts: top.flatMap((row) => {
      const product = nameById.get(row.productId);
      return product ? [{ ...product, unitsSold: row._sum.quantity ?? 0 }] : [];
    }),
    lowStock: lowStock.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      quantity: product.quantity,
      reorderLevel: product.reorderLevel,
      status: stockStatus(product.quantity, product.reorderLevel),
      supplierName: product.supplier?.name ?? null,
    })),
  };
}
