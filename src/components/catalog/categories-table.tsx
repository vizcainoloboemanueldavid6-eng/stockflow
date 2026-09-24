'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { CategoryDialog } from '@/components/catalog/category-dialog';
import { RecordDeleteDialog } from '@/components/catalog/record-delete-dialog';
import { CategoryLabel } from '@/components/inventory/badges';
import { EmptyState } from '@/components/layout/empty-state';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteCategory } from '@/lib/actions/catalog';
import { formatNumber } from '@/lib/format';
import type { CategoryRow } from '@/lib/queries/catalog';

export type CatalogPermissions = { create: boolean; update: boolean; delete: boolean };

export function CategoriesTable({
  rows,
  permissions,
  emptyAction,
}: {
  rows: CategoryRow[];
  permissions: CatalogPermissions;
  emptyAction?: React.ReactNode;
}) {
  const manage = permissions.update || permissions.delete;

  const columns = React.useMemo<ColumnDef<CategoryRow>[]>(() => {
    const list: ColumnDef<CategoryRow>[] = [
      {
        id: 'name',
        header: 'Category',
        cell: ({ row }) => (
          <CategoryLabel
            name={row.original.name}
            color={row.original.color}
            className="max-w-[10rem] font-medium sm:max-w-[14rem]"
          />
        ),
      },
      {
        id: 'products',
        header: 'Products',
        meta: { numeric: true },
        cell: ({ row }) => (
          <Link
            href={`/products?category=${row.original.id}`}
            className="font-medium underline-offset-4 hover:text-link hover:underline"
          >
            {formatNumber(row.original.activeCount)}
          </Link>
        ),
      },
      {
        id: 'archived',
        header: 'Archived',
        meta: { numeric: true, className: 'hidden sm:table-cell' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatNumber(row.original.productCount - row.original.activeCount)}
          </span>
        ),
      },
      {
        id: 'color',
        header: 'Colour',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.color}</span>
        ),
      },
    ];
    if (manage) {
      list.push({
        id: 'actions',
        header: '',
        meta: { label: 'Actions', className: 'w-0 pl-0 text-right' },
        cell: ({ row }) => <CategoryRowActions category={row.original} permissions={permissions} />,
      });
    }
    return list;
  }, [manage, permissions]);

  if (!rows.length) {
    return (
      <EmptyState
        title="No categories yet"
        description={
          permissions.create
            ? 'Categories group products and colour the charts. Create one before adding products.'
            : 'An admin creates categories; products are grouped by them.'
        }
        action={emptyAction}
      />
    );
  }

  return (
    <DataTable columns={columns} data={rows} getRowId={(row) => row.id} caption="Categories" />
  );
}

function CategoryRowActions({
  category,
  permissions,
}: {
  category: CategoryRow;
  permissions: CatalogPermissions;
}) {
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${category.name}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {permissions.update && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </DropdownMenuItem>
          )}
          {permissions.delete && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {permissions.update && (
        <CategoryDialog category={category} open={editing} onOpenChange={setEditing} />
      )}
      {permissions.delete && (
        <RecordDeleteDialog
          open={deleting}
          onOpenChange={setDeleting}
          kind="category"
          name={category.name}
          productCount={category.productCount}
          productsHref={`/products?category=${category.id}&archived=all`}
          onDelete={() => deleteCategory({ id: category.id })}
        />
      )}
    </>
  );
}
