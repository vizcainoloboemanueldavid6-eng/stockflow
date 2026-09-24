'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { MovementTypeBadge } from '@/components/inventory/badges';
import { EmptyState } from '@/components/layout/empty-state';
import { DataTable } from '@/components/tables/data-table';
import { DataTablePagination } from '@/components/tables/data-table-pagination';
import { ClearFiltersButton, FilterSelect, TableToolbar } from '@/components/tables/table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearchParamsUpdater } from '@/hooks/use-search-params-updater';
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPES, type MovementType } from '@/lib/constants';
import { formatSigned } from '@/lib/format';
import { MOVEMENT_LIST_DEFAULTS } from '@/lib/list-options';
import type { MovementRow } from '@/lib/queries/movements';
import { cn } from '@/lib/utils';

export type MovementTableQuery = {
  from?: string;
  to?: string;
  type?: MovementType;
  user?: string;
  sort: string;
  dir: 'asc' | 'desc';
};

const URL_DEFAULTS = {
  sort: MOVEMENT_LIST_DEFAULTS.sort,
  dir: MOVEMENT_LIST_DEFAULTS.dir,
  pageSize: MOVEMENT_LIST_DEFAULTS.pageSize,
};

/**
 * Movement history with URL-driven filters (date range, type, user) and server
 * pagination. Used by /movements and, scoped to one product, by /products/[id].
 */
export function MovementsTable({
  rows,
  total,
  page,
  pageCount,
  pageSize,
  query,
  users,
  productScoped = false,
  productFilter,
  historyEmpty,
  emptyAction,
}: {
  rows: MovementRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  query: MovementTableQuery;
  /** Options for the "User" filter; omit to hide it. */
  users?: { id: string; name: string }[];
  /** Hide the product column (the page is already about one product). */
  productScoped?: boolean;
  /** /movements?product=… shows which product the list is limited to. */
  productFilter?: { id: string; name: string } | null;
  /** True when there is no movement at all in scope (not just none matching the filters). */
  historyEmpty: boolean;
  emptyAction?: React.ReactNode;
}) {
  const { update, isPending } = useSearchParamsUpdater(URL_DEFAULTS);
  const filtered = Boolean(query.from || query.to || query.type || query.user || productFilter);
  const clearAll = () => update({ from: null, to: null, type: null, user: null, product: null });

  // Column visibility is tuned so the table fits without sideways scrolling from 390 px
  // up: on narrow screens the date and the type move under the product name.
  const columns = React.useMemo<ColumnDef<MovementRow>[]>(() => {
    const list: ColumnDef<MovementRow>[] = [
      {
        id: 'createdAt',
        accessorFn: (row) => row.createdAt,
        header: 'Date',
        enableSorting: true,
        meta: { className: productScoped ? undefined : 'hidden lg:table-cell' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <time dateTime={row.original.createdAt} className="text-muted-foreground">
              {row.original.createdLabel}
            </time>
            {productScoped && (
              <span className="text-xs text-muted-foreground sm:hidden">
                {MOVEMENT_TYPE_LABELS[row.original.type]}
              </span>
            )}
          </div>
        ),
      },
    ];
    if (!productScoped) {
      list.push({
        id: 'product',
        header: 'Product',
        cell: ({ row }) => {
          const { product, type, createdAt, createdLabel } = row.original;
          return (
            <div className="flex min-w-0 max-w-[12rem] flex-col sm:max-w-[16rem]">
              <Link
                href={`/products/${product.id}`}
                className="truncate font-medium underline-offset-4 hover:text-link hover:underline"
              >
                {product.name}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
              <span className="truncate text-xs text-muted-foreground lg:hidden">
                <span className="sm:hidden">{MOVEMENT_TYPE_LABELS[type]} · </span>
                <time dateTime={createdAt}>{createdLabel}</time>
              </span>
            </div>
          );
        },
      });
    }
    list.push(
      {
        id: 'type',
        header: 'Type',
        meta: { className: 'hidden sm:table-cell' },
        cell: ({ row }) => <MovementTypeBadge type={row.original.type} />,
      },
      {
        id: 'quantity',
        accessorFn: (row) => row.quantity,
        header: 'Change',
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => (
          <span
            className={cn(
              'font-semibold',
              row.original.delta > 0 ? 'text-success' : 'text-foreground',
            )}
          >
            {formatSigned(row.original.delta)}
          </span>
        ),
      },
      {
        id: 'reason',
        header: 'Reason',
        meta: { className: productScoped ? 'hidden 2xl:table-cell' : 'hidden xl:table-cell' },
        cell: ({ row }) => (
          <span
            className="block max-w-[12rem] truncate text-muted-foreground 2xl:max-w-[16rem]"
            title={row.original.reason ?? undefined}
          >
            {row.original.reason ?? '—'}
          </span>
        ),
      },
      {
        id: 'user',
        header: 'User',
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row }) =>
          row.original.user ? (
            <span className="block max-w-[10rem] truncate">{row.original.user.name}</span>
          ) : (
            <span className="italic text-muted-foreground">Deleted user</span>
          ),
      },
    );
    return list;
  }, [productScoped]);

  if (historyEmpty) {
    return (
      <EmptyState
        title="No stock movements yet"
        description={
          productScoped
            ? 'Receive, sell or adjust this product and every change is listed here.'
            : 'Every stock in, stock out and adjustment is listed here with who made it.'
        }
        action={emptyAction}
      />
    );
  }

  return (
    <div>
      <TableToolbar>
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <label className="grid gap-1 text-xs text-muted-foreground sm:flex sm:items-center sm:gap-2 sm:text-sm">
            <span>From</span>
            <Input
              type="date"
              value={query.from ?? ''}
              max={query.to}
              onChange={(event) => update({ from: event.target.value })}
              className="w-full sm:w-40"
              aria-label="From date"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground sm:flex sm:items-center sm:gap-2 sm:text-sm">
            <span>To</span>
            <Input
              type="date"
              value={query.to ?? ''}
              min={query.from}
              onChange={(event) => update({ to: event.target.value })}
              className="w-full sm:w-40"
              aria-label="To date"
            />
          </label>
        </div>
        <FilterSelect
          label="Filter by movement type"
          allLabel="All types"
          value={query.type}
          onChange={(type) => update({ type })}
          options={MOVEMENT_TYPES.map((type) => ({
            value: type,
            label: MOVEMENT_TYPE_LABELS[type],
          }))}
          className="sm:w-40"
        />
        {users && (
          <FilterSelect
            label="Filter by user"
            allLabel="All users"
            value={query.user}
            onChange={(user) => update({ user })}
            options={users.map((user) => ({ value: user.id, label: user.name }))}
            extraOptions={[{ value: 'none', label: 'Deleted user' }]}
            className="sm:w-44"
          />
        )}
        {productFilter && (
          <Badge variant="info" className="col-span-2 h-9 gap-1.5 px-3 text-sm">
            <span className="max-w-[12rem] truncate">{productFilter.name}</span>
            <button
              type="button"
              onClick={() => update({ product: null })}
              className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Stop filtering by ${productFilter.name}`}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </Badge>
        )}
        {filtered && <ClearFiltersButton onClick={clearAll} />}
      </TableToolbar>

      {total === 0 ? (
        <EmptyState
          illustration="search"
          title="No movements match these filters"
          description="Widen the date range or clear the filters to see the full history."
          action={
            <Button variant="outline" onClick={clearAll}>
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
            caption="Stock movements"
          />
          <DataTablePagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
            noun="movements"
            onPageChange={(next) => update({ page: next })}
            onPageSizeChange={(next) => update({ pageSize: next })}
          />
        </>
      )}
    </div>
  );
}
