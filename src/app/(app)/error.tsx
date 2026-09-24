'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Error boundary for app pages: keeps the shell, offers a retry. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive dark:text-red-400">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">This page could not be loaded</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong while loading the data. Your changes were not lost — try again in a
        moment.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
