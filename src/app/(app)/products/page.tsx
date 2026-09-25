import type { Metadata } from 'next';
import { Download, Plus } from 'lucide-react';
import { ProductDialog } from '@/components/inventory/product-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { ProductsTable } from '@/components/tables/products-table';
import { Button } from '@/components/ui/button';
import { requirePagePermission } from '@/lib/actions/guard';
import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import { isProductSortKey, PRODUCT_LIST_DEFAULTS } from '@/lib/list-options';
import { can } from '@/lib/permissions';
import { listProducts, productFormOptions } from '@/lib/queries/products';
import { parseSearchParams, type RawSearchParams } from '@/lib/search-params';
import { productListQuerySchema } from '@/lib/validations/product';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePagePermission('product:view');
  const query = parseSearchParams(productListQuerySchema, await searchParams);
  const sort = isProductSortKey(query.sort) ? query.sort : PRODUCT_LIST_DEFAULTS.sort;

  const [list, options, productCount] = await Promise.all([
    listProducts({ ...query, sort }),
    productFormOptions(),
    prisma.product.count(),
  ]);

  const permissions = {
    create: can(user.role, 'product:create'),
    update: can(user.role, 'product:update'),
    archive: can(user.role, 'product:archive'),
    delete: can(user.role, 'product:delete'),
    move: can(user.role, 'movement:create'),
  };
  const canCreateCategory = can(user.role, 'category:create');

  // The CSV export takes the same filters and order as the table (every page, no paging).
  const exportParams = new URLSearchParams();
  if (query.q) exportParams.set('q', query.q);
  if (query.category) exportParams.set('category', query.category);
  if (query.supplier) exportParams.set('supplier', query.supplier);
  if (query.status) exportParams.set('status', query.status);
  if (query.archived !== 'active') exportParams.set('archived', query.archived);
  if (sort !== PRODUCT_LIST_DEFAULTS.sort) exportParams.set('sort', sort);
  if (query.dir !== PRODUCT_LIST_DEFAULTS.dir) exportParams.set('dir', query.dir);
  const exportHref = `/api/export/products${exportParams.size ? `?${exportParams}` : ''}`;

  return (
    <>
      <PageHeader
        title="Products"
        description={`${formatNumber(productCount)} products in the catalogue. Search, filter and sort, then open one for its history.`}
        actions={
          <>
            {can(user.role, 'report:export') && productCount > 0 && (
              <Button asChild variant="outline">
                <a href={exportHref} download data-testid="export-products">
                  <Download aria-hidden="true" />
                  Export CSV
                </a>
              </Button>
            )}
            {permissions.create && (
              <ProductDialog
                categories={options.categories}
                suppliers={options.suppliers}
                canCreateCategory={canCreateCategory}
                trigger={
                  <Button data-testid="add-product">
                    <Plus aria-hidden="true" />
                    Add product
                  </Button>
                }
              />
            )}
          </>
        }
      />
      <ProductsTable
        rows={list.rows}
        total={list.total}
        page={list.page}
        pageCount={list.pageCount}
        pageSize={list.pageSize}
        query={{
          q: query.q,
          category: query.category,
          supplier: query.supplier,
          status: query.status,
          archived: query.archived,
          sort,
          dir: query.dir,
        }}
        categories={options.categories}
        suppliers={options.suppliers}
        permissions={permissions}
        catalogueEmpty={productCount === 0}
        canCreateCategory={canCreateCategory}
      />
    </>
  );
}
