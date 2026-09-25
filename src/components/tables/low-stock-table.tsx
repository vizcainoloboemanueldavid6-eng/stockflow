import Link from 'next/link';
import { PackagePlus } from 'lucide-react';
import { StockStatusBadge } from '@/components/inventory/badges';
import { MovementDialog } from '@/components/inventory/movement-dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import type { LowStockRow } from '@/lib/queries/dashboard';

/**
 * Dashboard alerts: products at or below their reorder level, emptiest first.
 * With `canRestock`, each row gets a "Restock" button that opens the movement
 * dialog preset to a stock-in for that product.
 */
export function LowStockTable({
  rows,
  canRestock = false,
}: {
  rows: LowStockRow[];
  canRestock?: boolean;
}) {
  return (
    <Table>
      <caption className="sr-only">Products at or below their reorder level</caption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Product</TableHead>
          <TableHead className="hidden xl:table-cell">SKU</TableHead>
          <TableHead className="text-right">On hand</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Reorder at</TableHead>
          <TableHead className="hidden sm:table-cell">Status</TableHead>
          <TableHead className="hidden xl:table-cell">Supplier</TableHead>
          {canRestock && (
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              {/* The width cap sits on the link, not the cell: browsers ignore max-width
                  on table cells, and one long unbroken name would widen the table. */}
              <Link
                href={`/products/${row.id}`}
                className="block max-w-[10rem] truncate font-medium text-link underline-offset-4 hover:underline sm:max-w-[16rem] xl:max-w-xs"
              >
                {row.name}
              </Link>
              <StockStatusBadge status={row.status} className="mt-1 sm:hidden" />
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground xl:table-cell">
              {row.sku}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatNumber(row.quantity)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
              {formatNumber(row.reorderLevel)}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <StockStatusBadge status={row.status} />
            </TableCell>
            <TableCell className="hidden max-w-[14rem] whitespace-normal text-muted-foreground [overflow-wrap:anywhere] xl:table-cell">
              {row.supplierName ?? '—'}
            </TableCell>
            {canRestock && (
              <TableCell className="w-0 text-right">
                <MovementDialog
                  defaultType="IN"
                  lockProduct
                  product={{
                    id: row.id,
                    sku: row.sku,
                    name: row.name,
                    quantity: row.quantity,
                    reorderLevel: row.reorderLevel,
                  }}
                  trigger={
                    <Button variant="outline" size="sm" aria-label={`Restock ${row.name}`}>
                      <PackagePlus aria-hidden="true" />
                      <span className="hidden lg:inline">Restock</span>
                    </Button>
                  }
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
