import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowLeftRight } from 'lucide-react';
import { CategoryLabel, StockStatusBadge } from '@/components/inventory/badges';
import { MovementDialog } from '@/components/inventory/movement-dialog';
import { ProductDetailActions } from '@/components/inventory/product-actions';
import { MovementsTable } from '@/components/tables/movements-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePagePermission } from '@/lib/actions/guard';
import { formatCurrency, formatNumber, formatPercent, formatSigned } from '@/lib/format';
import { can } from '@/lib/permissions';
import { listMovements } from '@/lib/queries/movements';
import { getProduct, productFormOptions, productMovementTotals } from '@/lib/queries/products';
import { wrapText } from '@/lib/safe-text';
import { parseSearchParams, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { movementListQuerySchema } from '@/lib/validations/movement';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product ? product.name : 'Product not found' };
}

export default async function ProductDetailPage({ params, searchParams }: Props) {
  const user = await requirePagePermission('product:view');
  const { id } = await params;
  const query = parseSearchParams(movementListQuerySchema, await searchParams);
  const sort = query.sort === 'quantity' ? 'quantity' : 'createdAt';

  const product = await getProduct(id);
  if (!product) notFound();

  const [history, totals, options] = await Promise.all([
    listMovements({ ...query, sort, product: product.id, user: undefined }),
    productMovementTotals(product.id),
    productFormOptions(),
  ]);

  const permissions = {
    create: can(user.role, 'product:create'),
    update: can(user.role, 'product:update'),
    archive: can(user.role, 'product:archive'),
    delete: can(user.role, 'product:delete'),
    move: can(user.role, 'movement:create'),
  };
  const margin =
    product.salePrice > 0 ? (product.salePrice - product.unitCost) / product.salePrice : 0;

  return (
    <>
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Products
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          {/* Text that a movement or an edit changes is keyed (wrapText / keyed elements) so
              router.refresh() replaces it even on a translated page (src/lib/safe-text.tsx). */}
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {wrapText(product.name)}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span key={product.sku} className="font-mono text-muted-foreground">
              {product.sku}
            </span>
            <StockStatusBadge status={product.status} />
            {product.archived && <Badge variant="outline">Archived</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductDetailActions
            product={product}
            categories={options.categories}
            suppliers={options.suppliers}
            permissions={permissions}
          />
        </div>
      </div>

      {product.archived && (
        <p className="mb-6 rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This product is archived: it is left out of the dashboard and the valuation and cannot
          move stock. Its history is kept below.
        </p>
      )}

      <section
        aria-label="Stock summary"
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
      >
        <Stat
          label="On hand"
          value={`${formatNumber(product.quantity)} units`}
          detail={`Reorder at ${formatNumber(product.reorderLevel)} units`}
          tone={product.status === 'in_stock' ? 'default' : 'warning'}
        />
        <Stat
          label="Stock value at cost"
          value={formatCurrency(product.stockValue)}
          detail={`${formatNumber(product.quantity)} × ${formatCurrency(product.unitCost)}`}
        />
        <Stat
          label="Sale price"
          value={formatCurrency(product.salePrice)}
          detail={`Unit cost ${formatCurrency(product.unitCost)}, margin ${formatPercent(margin)}`}
        />
        <Stat
          label="Lifetime movements"
          value={formatNumber(totals.movements)}
          detail={`${formatNumber(totals.received)} in, ${formatNumber(totals.sold)} out, ${formatSigned(totals.adjusted)} adjusted`}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-1 xl:self-start">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            {/* minmax(0, 1fr) and overflow-wrap:anywhere: a long word or pasted link in any
                field wraps inside the card instead of widening the page. */}
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm [&_dd]:min-w-0 [&_dd]:[overflow-wrap:anywhere]">
              <dt className="text-muted-foreground">Category</dt>
              <dd>
                <Link
                  href={`/products?category=${product.categoryId}`}
                  className="underline-offset-4 hover:underline"
                >
                  <CategoryLabel name={product.categoryName} color={product.categoryColor} />
                </Link>
              </dd>
              <dt className="text-muted-foreground">Supplier</dt>
              <dd>
                {product.supplierId ? (
                  <Link
                    href={`/products?supplier=${product.supplierId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {wrapText(product.supplierName)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No supplier</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{wrapText(product.createdLabel)}</dd>
              <dt className="text-muted-foreground">Last updated</dt>
              <dd>{wrapText(product.updatedLabel)}</dd>
              <dt className="text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-line">
                {wrapText(product.description) ?? (
                  <span className="text-muted-foreground">None</span>
                )}
              </dd>
            </dl>
            {product.imageUrl && (
              // A user-supplied link to any host: next/image would need every domain allow-listed.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="mt-5 aspect-square w-full max-w-xs rounded-md border object-cover"
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle>Movement history</CardTitle>
            <CardDescription>
              Every change to this product&apos;s stock, newest first
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MovementsTable
              rows={history.rows}
              total={history.total}
              page={history.page}
              pageCount={history.pageCount}
              pageSize={history.pageSize}
              query={{ from: query.from, to: query.to, type: query.type, sort, dir: query.dir }}
              productScoped
              historyEmpty={totals.movements === 0}
              emptyAction={
                permissions.move && !product.archived ? (
                  <MovementDialog
                    lockProduct
                    defaultType="IN"
                    product={{
                      id: product.id,
                      sku: product.sku,
                      name: product.name,
                      quantity: product.quantity,
                      reorderLevel: product.reorderLevel,
                    }}
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
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl',
          tone === 'warning' && 'text-warning',
        )}
      >
        {wrapText(value)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{wrapText(detail)}</p>
    </Card>
  );
}
