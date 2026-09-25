import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftRight, CircleAlert, Package, Wallet } from 'lucide-react';
import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart';
import { MovementTrendChart } from '@/components/charts/movement-trend-chart';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { MovementDialog } from '@/components/inventory/movement-dialog';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { LowStockTable } from '@/components/tables/low-stock-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePagePermission } from '@/lib/actions/guard';
import { appTimeZone, dayKey } from '@/lib/dates';
import { formatCurrency, formatDayKey, formatNumber } from '@/lib/format';
import { can } from '@/lib/permissions';
import { DASHBOARD_WINDOW_DAYS, getDashboardData } from '@/lib/queries/dashboard';
import { wrapText } from '@/lib/safe-text';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requirePagePermission('dashboard:view');
  const data = await getDashboardData();
  const { kpis } = data;
  const today = dayKey(new Date(), appTimeZone());
  const canMove = can(user.role, 'movement:create');

  const trend = data.flow.map((point) => ({ ...point, label: formatDayKey(point.day) }));
  const hasFlow = data.flowTotals.in + data.flowTotals.out > 0;
  const topProducts = data.topProducts.map((product) => ({
    key: product.id,
    label: product.name,
    value: product.unitsSold,
  }));
  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${firstName}. Here is how your stock looks today.`}
        actions={
          canMove ? (
            <MovementDialog
              trigger={
                <Button>
                  <ArrowLeftRight aria-hidden="true" />
                  Register movement
                </Button>
              }
            />
          ) : null
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          label="Inventory value"
          value={formatCurrency(kpis.inventoryValue)}
          detail={`${formatNumber(kpis.unitsOnHand)} units on hand, at unit cost`}
          icon={Wallet}
          href="/reports"
          testId="kpi-inventory-value"
        />
        <KpiCard
          label="Products"
          value={formatNumber(kpis.products)}
          detail={`Active products in ${formatNumber(kpis.categories)} categories`}
          icon={Package}
          href="/products"
          testId="kpi-products"
        />
        <KpiCard
          label="Low stock"
          value={formatNumber(kpis.lowStock)}
          detail={
            kpis.lowStock === 0
              ? 'Every product is above its reorder level'
              : `At or below reorder level, ${formatNumber(kpis.outOfStock)} out of stock`
          }
          icon={CircleAlert}
          tone={kpis.lowStock > 0 ? 'warning' : 'default'}
          href="#low-stock-alerts"
          testId="kpi-low-stock"
        />
        <KpiCard
          label="Movements today"
          value={formatNumber(kpis.movementsToday)}
          detail={`${formatNumber(kpis.unitsInToday)} units in, ${formatNumber(kpis.unitsOutToday)} units out`}
          icon={ArrowLeftRight}
          href={`/movements?from=${today}&to=${today}`}
          testId="kpi-movements-today"
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="min-w-0 xl:col-span-3">
          <CardHeader>
            <CardTitle>Stock in vs stock out</CardTitle>
            <CardDescription>Units per day, last {DASHBOARD_WINDOW_DAYS} days</CardDescription>
          </CardHeader>
          <CardContent>
            {hasFlow ? (
              <MovementTrendChart data={trend} totals={data.flowTotals} />
            ) : (
              <EmptyState
                compact
                title="No stock movements yet"
                description="Receive or sell stock and the daily trend appears here."
                action={
                  canMove ? (
                    <MovementDialog trigger={<Button size="sm">Register movement</Button>} />
                  ) : null
                }
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle>Best sellers</CardTitle>
            <CardDescription>
              Top 5 products by units sold (stock out), last {DASHBOARD_WINDOW_DAYS} days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length ? (
              <HorizontalBarChart
                data={topProducts}
                seriesName="Units sold"
                valueFormat="number"
                labelWidth={172}
                maxLabelChars={21}
                caption={`Units sold per product, last ${DASHBOARD_WINDOW_DAYS} days`}
              />
            ) : (
              <EmptyState
                compact
                title="No sales in this period"
                description="Stock out movements from the last 30 days rank here."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href="/movements">Open movements</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="low-stock-alerts" className="mt-6 scroll-mt-20">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Low stock alerts</CardTitle>
            <CardDescription>
              Products at or below their reorder level, emptiest first
            </CardDescription>
          </div>
          {data.lowStock.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/products?status=low_stock">Low stock in products</Link>
              </Button>
              {kpis.outOfStock > 0 && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/products?status=out_of_stock">Out of stock</Link>
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className={data.lowStock.length ? 'px-0 pb-2' : undefined}>
          {data.lowStock.length ? (
            <LowStockTable rows={data.lowStock} canRestock={canMove} />
          ) : (
            <EmptyState
              compact
              illustration="check"
              title="Nothing to reorder"
              description="Every active product is above its reorder level."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/products">Browse products</Link>
                </Button>
              }
            />
          )}
          {kpis.lowStock > data.lowStock.length && (
            <p className="px-5 pt-2 text-xs text-muted-foreground">
              {wrapText(
                `Showing the ${data.lowStock.length} emptiest of ${formatNumber(kpis.lowStock)} products that need attention.`,
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
