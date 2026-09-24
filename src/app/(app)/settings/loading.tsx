import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading settings" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-9 w-72 max-w-full" />
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="space-y-4 rounded-lg border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-56" />
          <div className="max-w-lg space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
