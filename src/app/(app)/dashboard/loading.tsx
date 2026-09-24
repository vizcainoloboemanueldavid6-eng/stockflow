import { ChartSkeleton, TableSkeleton } from '@/components/layout/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading dashboard" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border bg-card p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-32 max-w-full" />
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <ChartSkeleton className="xl:col-span-3" />
        <ChartSkeleton className="xl:col-span-2" bars />
      </div>
      <TableSkeleton rows={6} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
