import { ChartSkeleton, TableSkeleton } from '@/components/layout/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReportsLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading reports" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="space-y-4 rounded-lg border bg-card p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-64 max-w-full" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
            <Skeleton className="h-9 w-48" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 2xl:grid-cols-5">
        <div className="2xl:col-span-3">
          <TableSkeleton rows={6} />
        </div>
        <ChartSkeleton className="2xl:col-span-2" bars />
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
