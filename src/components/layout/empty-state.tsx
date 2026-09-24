import { cn } from '@/lib/utils';

/**
 * Empty state with a small illustration and a call to action (spec section 6).
 * Pass the CTA as `action`, e.g. <Button onClick={...}>Add product</Button>.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  compact = false,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 px-6 text-center',
        compact ? 'py-8' : 'py-14',
        className,
      )}
    >
      <EmptyBoxIllustration className={compact ? 'h-16' : 'h-24'} />
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** An open, empty carton on a shelf line - drawn with theme colours so it works in dark mode. */
export function EmptyBoxIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true" className={cn('w-auto text-primary', className)}>
      <ellipse cx="80" cy="98" rx="58" ry="6" className="fill-muted" />
      <path
        d="M36 44 80 30l44 14v40L80 98 36 84z"
        className="fill-card stroke-border"
        strokeWidth="2"
      />
      <path d="M36 44 80 58l44-14" fill="none" className="stroke-border" strokeWidth="2" />
      <path d="M80 58v40" className="stroke-border" strokeWidth="2" />
      <path
        d="M36 44 22 60l44 14 14-16z"
        className="fill-muted stroke-border"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m124 44 14 16-44 14-14-16z"
        className="fill-muted stroke-border"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M58 37 80 30l22 7"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      <circle cx="118" cy="20" r="5" fill="currentColor" fillOpacity="0.25" />
      <circle cx="40" cy="22" r="3" fill="currentColor" fillOpacity="0.2" />
      <path
        d="M131 30h8M135 26v8"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
