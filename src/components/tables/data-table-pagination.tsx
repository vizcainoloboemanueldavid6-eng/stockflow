'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/format';
import { Swap } from '@/lib/safe-text';
import { PAGE_SIZE_OPTIONS } from '@/lib/list-options';

/** "Showing 11-20 of 60", rows-per-page and page buttons for a server-paged table. */
export function DataTablePagination({
  page,
  pageCount,
  pageSize,
  total,
  noun = 'rows',
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  noun?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const labelId = React.useId();
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const sizes: number[] = PAGE_SIZE_OPTIONS.includes(pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? [...PAGE_SIZE_OPTIONS]
    : [...PAGE_SIZE_OPTIONS, pageSize].sort((a, b) => a - b);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col-reverse items-center justify-between gap-3 pt-3 text-sm sm:flex-row"
    >
      <p className="text-muted-foreground" aria-live="polite">
        <Swap>
          {total === 0
            ? `No ${noun}`
            : `Showing ${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)} ${noun}`}
        </Swap>
      </p>
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2">
          <span className="hidden text-muted-foreground sm:inline" id={labelId}>
            Rows per page
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger
              size="sm"
              className="w-[4.5rem]"
              aria-label="Rows per page"
              aria-describedby={labelId}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          <Swap>{`Page ${page} of ${pageCount}`}</Swap>
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 sm:inline-flex"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            aria-label="First page"
          >
            <ChevronsLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 sm:inline-flex"
            onClick={() => onPageChange(pageCount)}
            disabled={page >= pageCount}
            aria-label="Last page"
          >
            <ChevronsRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
