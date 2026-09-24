import { TableSkeleton } from '@/components/layout/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProductLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading product" className="space-y-6">
      <Skeleton className="h-4 w-20" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border bg-card p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28 max-w-full" />
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 rounded-lg border bg-card p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        <div className="xl:col-span-2">
          <TableSkeleton rows={6} />
        </div>
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
