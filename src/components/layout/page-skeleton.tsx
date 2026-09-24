import { Skeleton } from '@/components/ui/skeleton';

/** Generic page skeleton: header, a row of KPI cards and a table. Used by loading.tsx files. */
export function PageSkeleton({ cards = 4, rows = 8 }: { cards?: number; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
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
