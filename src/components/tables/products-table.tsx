'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { CategoryLabel, StockStatusBadge } from '@/components/inventory/badges';
import {
  ProductActionsMenu,
  type ProductPermissions,
} from '@/components/inventory/product-actions';
import { ProductDialog } from '@/components/inventory/product-dialog';
import { EmptyState } from '@/components/layout/empty-state';
import { DataTable } from '@/components/tables/data-table';
import { DataTablePagination } from '@/components/tables/data-table-pagination';
import {
  ClearFiltersButton,
  DebouncedSearchInput,
  FilterSelect,
  TableToolbar,
} from '@/components/tables/table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSearchParamsUpdater } from '@/hooks/use-search-params-updater';
import { STOCK_STATUS_LABELS, STOCK_STATUSES, type StockStatus } from '@/lib/constants';
import { formatCurrency, formatNumber } from '@/lib/format';
import { PRODUCT_LIST_DEFAULTS } from '@/lib/list-options';
import type { CategoryOption, Option, ProductRow } from '@/lib/queries/products';

export type ProductTableQuery = {
  q?: string;
  category?: string;
  supplier?: string;
  status?: StockStatus;
  archived: 'active' | 'archived' | 'all';
  sort: string;
  dir: 'asc' | 'desc';
};

const URL_DEFAULTS = {
  sort: PRODUCT_LIST_DEFAULTS.sort,
  dir: PRODUCT_LIST_DEFAULTS.dir,
  pageSize: PRODUCT_LIST_DEFAULTS.pageSize,
  archived: 'active',
};

/**
 * /products table. Search, filters, sorting and pagination live in the URL; the
 * server page reads them, queries one page and passes the rows here. Changing a
 * control replaces the URL inside a transition, so the old rows stay (dimmed)
 * until the new page arrives.
 */
export function ProductsTable({
  rows,
  total,
  page,
  pageCount,
  pageSize,
  query,
  categories,
  suppliers,
  permissions,
  catalogueEmpty,
}: {
  rows: ProductRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  query: ProductTableQuery;
  categories: CategoryOption[];
  suppliers: Option[];
  permissions: ProductPermissions;
  /** True when there are no products at all (not just none matching the filters). */
  catalogueEmpty: boolean;
}) {
  const { update, isPending } = useSearchParamsUpdater(URL_DEFAULTS);
  const filtered = Boolean(
    query.q || query.category || query.supplier || query.status || query.archived !== 'active',
  );

  const columns = React.useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        header: 'Product',
        enableSorting: true,
        cell: ({ row }) => {
          const product = row.original;
          return (
            <div className="flex min-w-0 max-w-[12.5rem] flex-col gap-0.5 sm:max-w-[16rem] 2xl:max-w-xs">
              <Link
                href={`/products/${product.id}`}
                className="truncate font-medium text-foreground underline-offset-4 hover:text-link hover:underline"
              >
                {product.name}
              </Link>
              <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                {product.sku}
                {product.archived && (
                  <Badge variant="outline" className="px-1.5 py-0 font-sans">
                    Archived
                  </Badge>
                )}
              </span>
              {/* Phones: the status column is hidden, so the badge sits under the name. */}
              <StockStatusBadge status={product.status} className="mt-1 sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'category',
        accessorFn: (row) => row.categoryName,
        header: 'Category',
        enableSorting: true,
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => (
          <CategoryLabel
            name={row.original.categoryName}
            color={row.original.categoryColor}
            className="max-w-[10rem]"
          />
        ),
      },
      {
        id: 'supplier',
        accessorFn: (row) => row.supplierName ?? '',
        header: 'Supplier',
        enableSorting: true,
        meta: { className: 'hidden 2xl:table-cell' },
        cell: ({ row }) => (
          <span className="block max-w-[10rem] truncate text-muted-foreground">
            {row.original.supplierName ?? '—'}
          </span>
        ),
      },
      {
        id: 'quantity',
        accessorFn: (row) => row.quantity,
        header: 'Stock',
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => (
          <span className="font-medium">{formatNumber(row.original.quantity)}</span>
        ),
      },
      {
        id: 'reorderLevel',
        accessorFn: (row) => row.reorderLevel,
        header: 'Reorder at',
        enableSorting: true,
        meta: { numeric: true, className: 'hidden xl:table-cell' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatNumber(row.original.reorderLevel)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { className: 'hidden sm:table-cell' },
        cell: ({ row }) => <StockStatusBadge status={row.original.status} />,
      },
      {
        id: 'unitCost',
        accessorFn: (row) => row.unitCost,
        header: 'Unit cost',
        enableSorting: true,
        meta: { numeric: true, className: 'hidden 2xl:table-cell' },
        cell: ({ row }) => formatCurrency(row.original.unitCost),
      },
      {
        id: 'salePrice',
        accessorFn: (row) => row.salePrice,
        header: 'Price',
        enableSorting: true,
        meta: { numeric: true, className: 'hidden xl:table-cell' },
        cell: ({ row }) => formatCurrency(row.original.salePrice),
      },
      {
        id: 'actions',
        header: '',
        meta: { label: 'Actions', className: 'w-0 pl-0 text-right' },
        cell: ({ row }) => (
          <ProductActionsMenu
            product={row.original}
            categories={categories}
            suppliers={suppliers}
            permissions={permissions}
          />
        ),
      },
    ],
    [categories, suppliers, permissions],
  );

  // The page header has the main "Add product" button; this one is the empty-state CTA.
  const addButton = permissions.create ? (
    <ProductDialog
      categories={categories}
      suppliers={suppliers}
      trigger={
        <Button data-testid="add-product-empty">
          <Plus aria-hidden="true" />
          Add product
        </Button>
      }
    />
  ) : null;

  if (catalogueEmpty) {
    return (
      <EmptyState
        title="No products yet"
        description={
          permissions.create
            ? 'Add your first product to start tracking stock, value and movements.'
            : 'Products appear here once someone with edit rights adds them.'
        }
        action={addButton}
      />
    );
  }

  return (
    <div>
      <TableToolbar>
        <DebouncedSearchInput
          value={query.q ?? ''}
          onChange={(q) => update({ q })}
          placeholder="Search name or SKU"
          label="Search products by name or SKU"
        />
        <FilterSelect
          label="Filter by category"
          allLabel="All categories"
          value={query.category}
          onChange={(category) => update({ category })}
          options={categories.map((category) => ({
            value: category.id,
            label: category.name,
            swatch: category.color,
          }))}
        />
        <FilterSelect
          label="Filter by supplier"
          allLabel="All suppliers"
          value={query.supplier}
          onChange={(supplier) => update({ supplier })}
          options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
          extraOptions={[{ value: 'none', label: 'No supplier' }]}
        />
        <FilterSelect
          label="Filter by stock status"
          allLabel="Any stock status"
          value={query.status}
          onChange={(status) => update({ status })}
          options={STOCK_STATUSES.map((status) => ({
            value: status,
            label: STOCK_STATUS_LABELS[status],
          }))}
          className="sm:w-40"
        />
        <FilterSelect
          label="Show archived products"
          allLabel="Active products"
          value={query.archived === 'active' ? undefined : query.archived}
          onChange={(archived) => update({ archived: archived ?? 'active' })}
          options={[
            { value: 'archived', label: 'Archived only' },
            { value: 'all', label: 'Active and archived' },
          ]}
          className="sm:w-44"
        />
        {filtered && (
          <ClearFiltersButton
            onClick={() =>
              update({ q: null, category: null, supplier: null, status: null, archived: null })
            }
          />
        )}
      </TableToolbar>

      {total === 0 ? (
        <EmptyState
          illustration="search"
          title="No products match these filters"
          description="Try another search term, or clear the filters to see every product."
          action={
            <Button
              variant="outline"
              onClick={() =>
                update({ q: null, category: null, supplier: null, status: null, archived: null })
              }
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            sorting={{ sort: query.sort, dir: query.dir }}
            onSortChange={({ sort, dir }) => update({ sort, dir })}
            pending={isPending}
            caption="Products"
          />
          <DataTablePagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
            noun="products"
            onPageChange={(next) => update({ page: next })}
            onPageSizeChange={(next) => update({ pageSize: next })}
          />
        </>
      )}
    </div>
  );
}
