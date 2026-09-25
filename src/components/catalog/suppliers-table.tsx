'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Mail, MoreHorizontal, Pencil, Phone, Trash2 } from 'lucide-react';
import type { CatalogPermissions } from '@/components/catalog/categories-table';
import { RecordDeleteDialog } from '@/components/catalog/record-delete-dialog';
import { SupplierDialog } from '@/components/catalog/supplier-dialog';
import { EmptyState } from '@/components/layout/empty-state';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteSupplier } from '@/lib/actions/catalog';
import { formatNumber } from '@/lib/format';
import type { SupplierRow } from '@/lib/queries/catalog';

export function SuppliersTable({
  rows,
  permissions,
  emptyAction,
}: {
  rows: SupplierRow[];
  permissions: CatalogPermissions;
  emptyAction?: React.ReactNode;
}) {
  const manage = permissions.update || permissions.delete;

  const columns = React.useMemo<ColumnDef<SupplierRow>[]>(() => {
    const list: ColumnDef<SupplierRow>[] = [
      {
        id: 'name',
        header: 'Supplier',
        cell: ({ row }) => (
          <div className="flex min-w-0 max-w-[12rem] flex-col sm:max-w-[14rem] xl:max-w-xs">
            <span className="truncate font-medium">{row.original.name}</span>
            {row.original.notes && (
              <span className="truncate text-xs text-muted-foreground" title={row.original.notes}>
                {row.original.notes}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'contact',
        header: 'Contact',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) => {
          const { email, phone } = row.original;
          if (!email && !phone) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-col gap-0.5 text-sm">
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1.5 text-link underline-offset-4 hover:underline"
                >
                  <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                  {email}
                </a>
              )}
              {phone && (
                <a
                  href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                  {phone}
                </a>
              )}
            </div>
          );
        },
      },
      {
        id: 'products',
        header: 'Products',
        meta: { numeric: true },
        cell: ({ row }) => (
          <Link
            href={`/products?supplier=${row.original.id}&archived=all`}
            className="font-medium underline-offset-4 hover:text-link hover:underline"
          >
            {formatNumber(row.original.productCount)}
          </Link>
        ),
      },
    ];
    if (manage) {
      list.push({
        id: 'actions',
        header: '',
        meta: { label: 'Actions', className: 'w-0 pl-0 text-right', stateful: true },
        cell: ({ row }) => <SupplierRowActions supplier={row.original} permissions={permissions} />,
      });
    }
    return list;
  }, [manage, permissions]);

  if (!rows.length) {
    return (
      <EmptyState
        title="No suppliers yet"
        description={
          permissions.create
            ? 'Add the vendors you buy from, then link products to them for reordering.'
            : 'An admin adds suppliers; products can then be linked to them.'
        }
        action={emptyAction}
      />
    );
  }

  return <DataTable columns={columns} data={rows} getRowId={(row) => row.id} caption="Suppliers" />;
}

function SupplierRowActions({
  supplier,
  permissions,
}: {
  supplier: SupplierRow;
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
            aria-label={`Actions for ${supplier.name}`}
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
        <SupplierDialog supplier={supplier} open={editing} onOpenChange={setEditing} />
      )}
      {permissions.delete && (
        <RecordDeleteDialog
          open={deleting}
          onOpenChange={setDeleting}
          kind="supplier"
          name={supplier.name}
          productCount={supplier.productCount}
          productsHref={`/products?supplier=${supplier.id}&archived=all`}
          onDelete={() => deleteSupplier({ id: supplier.id })}
        />
      )}
    </>
  );
}
