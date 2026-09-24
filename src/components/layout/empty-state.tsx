import { cn } from '@/lib/utils';

export type EmptyIllustration = 'box' | 'search' | 'check';

/**
 * Empty state with a small illustration and a call to action (spec section 6).
 * Pass the CTA as `action`, e.g. <Button onClick={...}>Add product</Button>.
 * `illustration`: 'box' (nothing here yet), 'search' (filters matched nothing),
 * 'check' (nothing to worry about, e.g. no low-stock alerts).
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  compact = false,
  illustration = 'box',
  testId,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
  illustration?: EmptyIllustration;
  testId?: string;
}) {
  const size = compact ? 'h-16' : 'h-24';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 px-6 text-center',
        compact ? 'py-8' : 'py-14',
        className,
      )}
      data-testid={testId ?? 'empty-state'}
    >
      {illustration === 'search' ? (
        <EmptySearchIllustration className={size} />
      ) : illustration === 'check' ? (
        <AllClearIllustration className={size} />
      ) : (
        <EmptyBoxIllustration className={size} />
      )}
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

/** A magnifier over three blank list rows - "nothing matches these filters". */
export function EmptySearchIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true" className={cn('w-auto text-primary', className)}>
      <ellipse cx="80" cy="100" rx="56" ry="5" className="fill-muted" />
      <rect x="28" y="18" width="92" height="74" rx="8" className="fill-card stroke-border" />
      <rect x="40" y="32" width="52" height="7" rx="3.5" className="fill-muted" />
      <rect x="40" y="50" width="64" height="7" rx="3.5" className="fill-muted" />
      <rect x="40" y="68" width="40" height="7" rx="3.5" className="fill-muted" />
      <circle
        cx="108"
        cy="62"
        r="18"
        className="fill-background"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path d="m121 75 13 13" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M101 56l14 12M115 56l-14 12"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A tidy stack of boxes with a check mark - "all good, nothing needs attention". */
export function AllClearIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true" className={cn('w-auto text-success', className)}>
      <ellipse cx="80" cy="100" rx="56" ry="5" className="fill-muted" />
      <rect
        x="38"
        y="60"
        width="40"
        height="36"
        rx="3"
        className="fill-card stroke-border"
        strokeWidth="2"
      />
      <rect
        x="82"
        y="60"
        width="40"
        height="36"
        rx="3"
        className="fill-card stroke-border"
        strokeWidth="2"
      />
      <rect
        x="60"
        y="22"
        width="40"
        height="36"
        rx="3"
        className="fill-card stroke-border"
        strokeWidth="2"
      />
      <path d="M58 60v10M102 60v10M80 22v10" className="stroke-border" strokeWidth="2" />
      <circle cx="118" cy="30" r="14" fill="currentColor" fillOpacity="0.15" />
      <path
        d="m111 30 5 5 9-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
