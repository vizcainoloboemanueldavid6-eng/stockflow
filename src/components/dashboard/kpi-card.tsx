import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
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
            'flex size-8 shrink-0 items-center justify-center rounded-md',
            tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-link',
          )}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-1 text-3xl font-semibold tracking-tight" data-testid={testId}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </>
  );

  return (
    <Card className="relative p-5 transition-colors has-[a:hover]:bg-muted/40">
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
