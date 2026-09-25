'use client';

import * as React from 'react';
import {
  type ColumnDef,
  getCoreRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type SortState = { sort: string; dir: 'asc' | 'desc' };

/**
 * Renders a column's `header` / `cell` by calling it as a plain render function.
 * TanStack's flexRender mounts it as a component instead, and the column functions are
 * re-created whenever the table's props change (every router.refresh()): React then sees a
 * new component type, unmounts the old cell and removes its text node - which throws
 * NotFoundError on a page the browser has translated (the text node was moved into
 * <font> wrappers). Column functions only build elements; they never call hooks.
 */
function renderSlot<TProps extends object>(slot: unknown, props: TProps): React.ReactNode {
  return typeof slot === 'function'
    ? (slot as (props: TProps) => React.ReactNode)(props)
    : (slot as React.ReactNode);
}

function rowSignature(row: unknown): string {
  try {
    return JSON.stringify(row) ?? '';
  } catch {
    return '';
  }
}

/**
 * TanStack Table in "manual" mode: the server already filtered, sorted and paged
 * the rows, the table renders them and reports header clicks through
 * `onSortChange` (the page turns that into URL search params). Columns opt in to
 * sorting with `enableSorting: true` and an `id` equal to a whitelisted sort key.
 *
 * On narrow screens the table scrolls horizontally inside its card and columns can
 * hide themselves with `meta.className: 'hidden md:table-cell'`.
 */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  sorting,
  onSortChange,
  pending = false,
  caption,
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column value types vary per column
  columns: ColumnDef<TData, any>[];
  data: TData[];
  getRowId: (row: TData) => string;
  sorting?: SortState;
  onSortChange?: (next: SortState) => void;
  pending?: boolean;
  caption?: string;
  className?: string;
}) {
  const sortingState: SortingState = sorting
    ? [{ id: sorting.sort, desc: sorting.dir === 'desc' }]
    : [];

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: { sorting: sortingState },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sortingState) : updater;
      const first = next[0];
      if (first && onSortChange) onSortChange({ sort: first.id, dir: first.desc ? 'desc' : 'asc' });
    },
  });

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-opacity',
        pending && 'pointer-events-none opacity-60',
        className,
      )}
      aria-busy={pending}
    >
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const sorted = header.column.getIsSorted();
                // Opt-in: only columns that set enableSorting: true are sortable.
                const canSort =
                  header.column.columnDef.enableSorting === true &&
                  header.column.getCanSort() &&
                  Boolean(onSortChange);
                const content = header.isPlaceholder
                  ? null
                  : renderSlot(header.column.columnDef.header, header.getContext());
                return (
                  <TableHead
                    key={header.id}
                    className={cn(meta?.numeric && 'text-right', meta?.className)}
                    aria-sort={
                      canSort
                        ? sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          '-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase tracking-wide outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                          meta?.numeric && 'flex-row-reverse',
                          sorted && 'text-foreground',
                        )}
                      >
                        {content}
                        {sorted === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                        )}
                      </button>
                    ) : meta?.label && !content ? (
                      <span className="sr-only">{meta.label}</span>
                    ) : (
                      content
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            // Cells are keyed by the row's data, so a changed row (new quantity, status,
            // name...) gets new cells instead of edited text nodes: browser translation
            // replaces text nodes, and an edit to the replaced node would never show.
            const signature = rowSignature(row.original);
            return (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <TableCell
                      key={meta?.stateful ? cell.id : `${cell.id}:${signature}`}
                      className={cn(meta?.numeric && 'text-right tabular-nums', meta?.className)}
                    >
                      {renderSlot(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
