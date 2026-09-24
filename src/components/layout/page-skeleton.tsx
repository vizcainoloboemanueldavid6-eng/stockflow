import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/** Generic page skeleton: header, a row of KPI cards and a table. Used by loading.tsx files. */
export function PageSkeleton({
  cards = 4,
  rows = 8,
  toolbar = false,
}: {
  cards?: number;
  rows?: number;
  /** A row of filter controls above the table. */
  toolbar?: boolean;
}) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {toolbar && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-9 w-full sm:w-64" />
          <Skeleton className="h-9 w-full sm:w-44" />
          <Skeleton className="h-9 w-full sm:w-44" />
          <Skeleton className="h-9 w-full sm:ml-auto sm:w-32" />
        </div>
      )}
      {cards > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="space-y-3 rounded-lg border bg-card p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      )}
      <TableSkeleton rows={rows} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/** Card with a title and a chart-shaped block (lines, or horizontal bars with `bars`). */
export function ChartSkeleton({ className, bars = false }: { className?: string; bars?: boolean }) {
  return (
    <div className={cn('space-y-4 rounded-lg border bg-card p-5', className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-52 max-w-full" />
      </div>
      {bars ? (
        <div className="space-y-3 pt-2">
          {[92, 78, 64, 50, 38].map((width) => (
            <div key={width} className="flex items-center gap-3">
              <Skeleton className="h-3 w-24 shrink-0" />
              <Skeleton className="h-5" style={{ width: `${width}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <Skeleton className="h-[260px] w-full" />
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex gap-4 border-b p-4">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-4 p-4">
            {Array.from({ length: columns }, (_, col) => (
              <Skeleton key={col} className={col === 0 ? 'h-4 flex-[2]' : 'h-4 flex-1'} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
