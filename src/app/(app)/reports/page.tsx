import type { Metadata } from 'next';
import Link from 'next/link';
import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart';
import { CategoryLabel } from '@/components/inventory/badges';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { ReportExports } from '@/components/reports/report-exports';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requirePagePermission } from '@/lib/actions/guard';
import { appTimeZone, dayKey, shiftDay } from '@/lib/dates';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { can } from '@/lib/permissions';
import { getValuation } from '@/lib/queries/catalog';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const user = await requirePagePermission('report:view');
  const valuation = await getValuation();
  const today = dayKey(new Date(), appTimeZone());
  const { totals } = valuation;
  const margin = totals.retailValue - totals.costValue;
  const hasStock = totals.costValue > 0;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Download your data as CSV and see where the inventory value sits."
      />

      {can(user.role, 'report:export') && (
        <section aria-labelledby="exports-heading" className="mb-8">
          <h2 id="exports-heading" className="mb-3 text-lg font-semibold tracking-tight">
            CSV exports
          </h2>
          <ReportExports defaultFrom={shiftDay(today, -29)} defaultTo={today} />
          <p className="mt-2 text-xs text-muted-foreground">
            Files open directly in Excel, Numbers or Google Sheets (UTF-8, comma separated).
          </p>
        </section>
      )}

      <section aria-labelledby="valuation-heading">
        <h2 id="valuation-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Inventory valuation by category
        </h2>

        {valuation.rows.length === 0 ? (
          <EmptyState
            title="No categories yet"
            description="Create categories and products, and their stock value is broken down here."
            action={
              <Button asChild variant="outline">
                <Link href="/categories">Open categories</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryTile
                label="Value at cost"
                value={formatCurrency(totals.costValue)}
                detail={`${formatNumber(totals.units)} units in ${formatNumber(totals.products)} active products`}
              />
              <SummaryTile
                label="Value at sale price"
                value={formatCurrency(totals.retailValue)}
                detail="If every unit on hand sold at its current price"
              />
              <SummaryTile
                label="Potential gross margin"
                value={formatCurrency(margin)}
                detail={
                  totals.retailValue > 0
                    ? `${formatPercent(margin / totals.retailValue)} of the sale value`
                    : 'No stock on hand'
                }
              />
            </div>

            <div className="mt-6 grid gap-6 2xl:grid-cols-5">
              <Card className="min-w-0 2xl:col-span-3">
                <CardHeader>
                  <CardTitle>By category</CardTitle>
                  <CardDescription>
                    Active products only, largest value at cost first
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <Table>
                    <caption className="sr-only">Inventory valuation by category</caption>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Category</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Products</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Units</TableHead>
                        <TableHead className="text-right">At cost</TableHead>
                        <TableHead className="hidden text-right lg:table-cell">At price</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valuation.rows.map((row) => (
                        <TableRow key={row.categoryId}>
                          <TableCell className="max-w-[10rem] sm:max-w-none">
                            <Link
                              href={`/products?category=${row.categoryId}`}
                              className="underline-offset-4 hover:underline"
                            >
                              <CategoryLabel name={row.name} color={row.color} />
                            </Link>
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">
                            {formatNumber(row.products)}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums md:table-cell">
                            {formatNumber(row.units)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(row.costValue)}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
                            {formatCurrency(row.retailValue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatPercent(row.share)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="hover:bg-transparent">
                        <TableCell>Total</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {formatNumber(totals.products)}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {formatNumber(totals.units)}
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums"
                          data-testid="valuation-total"
                        >
                          {formatCurrency(totals.costValue)}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">
                          {formatCurrency(totals.retailValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {hasStock ? formatPercent(1) : '—'}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </CardContent>
              </Card>

              <Card className="min-w-0 2xl:col-span-2">
                <CardHeader>
                  <CardTitle>Value at cost</CardTitle>
                  <CardDescription>Per category, in US dollars</CardDescription>
                </CardHeader>
                <CardContent>
                  {hasStock ? (
                    <HorizontalBarChart
                      data={valuation.rows.map((row) => ({
                        key: row.categoryId,
                        label: row.name,
                        value: row.costValue,
                      }))}
                      seriesName="Value at cost"
                      valueFormat="currency"
                      labelWidth={156}
                      maxLabelChars={19}
                      caption="Inventory value at cost per category"
                    />
                  ) : (
                    <EmptyState
                      compact
                      title="No stock on hand"
                      description="Receive stock and the value per category is charted here."
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
          </>
        )}
      </section>
    </>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}
