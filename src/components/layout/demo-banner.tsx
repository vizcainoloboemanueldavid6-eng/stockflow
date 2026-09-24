import { Info } from 'lucide-react';
import { isSqliteMode } from '@/lib/config';

/**
 * Shown only in the zero-external-service demo mode (DATABASE_PROVIDER=sqlite),
 * where each server instance works on its own copy of the seeded database.
 */
export function DemoBanner() {
  if (!isSqliteMode()) return null;
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-1.5 text-center text-xs text-foreground"
    >
      <Info className="size-3.5 shrink-0 text-link" aria-hidden="true" />
      <span>Demo environment — data resets periodically.</span>
    </div>
  );
}
