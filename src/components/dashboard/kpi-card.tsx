import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { wrapText } from '@/lib/safe-text';
import { cn } from '@/lib/utils';

/**
 * Stat tile: sentence-case label, one prominent value (proportional figures),
 * one line of context. With `href` the whole tile is a link.
 */
export function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  href,
  tone = 'default',
  testId,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: 'default' | 'warning';
  testId?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'hidden size-8 shrink-0 items-center justify-center rounded-md sm:flex',
            tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-link',
          )}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
      </div>
      {/* Values and details are keyed text (src/lib/safe-text.tsx): after a refresh the new
          figures replace the old ones even on a page the browser has translated. */}
      <p
        key={value}
        className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl"
        data-testid={testId}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{wrapText(detail)}</p>}
    </>
  );

  return (
    <Card className="relative min-w-0 p-4 transition-colors has-[a:hover]:bg-muted/40 sm:p-5">
      {href ? (
        <Link
          href={href}
          className="block rounded-md outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}
