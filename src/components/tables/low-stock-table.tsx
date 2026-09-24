import Link from 'next/link';
import { StockStatusBadge } from '@/components/inventory/badges';
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

/** Dashboard alerts: products at or below their reorder level, emptiest first. */
export function LowStockTable({ rows }: { rows: LowStockRow[] }) {
  return (
    <Table>
      <caption className="sr-only">Products at or below their reorder level</caption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Product</TableHead>
          <TableHead className="hidden sm:table-cell">SKU</TableHead>
          <TableHead className="text-right">On hand</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Reorder at</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden lg:table-cell">Supplier</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="max-w-[12rem] sm:max-w-xs">
              <Link
                href={`/products/${row.id}`}
                className="block truncate font-medium text-link underline-offset-4 hover:underline"
              >
                {row.name}
              </Link>
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
              {row.sku}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatNumber(row.quantity)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
              {formatNumber(row.reorderLevel)}
            </TableCell>
            <TableCell>
              <StockStatusBadge status={row.status} />
            </TableCell>
            <TableCell className="hidden text-muted-foreground lg:table-cell">
              {row.supplierName ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
