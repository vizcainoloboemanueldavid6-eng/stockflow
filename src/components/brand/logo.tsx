import { cn } from '@/lib/utils';

/** StockFlow mark: a box (isometric cube) on the brand blue. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="7" fill="#2563EB" />
      <path
        d="M9 11.5 16 8l7 3.5v9L16 24l-7-3.5z M9 11.5 16 15l7-3.5M16 15v9"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  collapsed = false,
}: {
  className?: string;
  collapsed?: boolean;
}) {
  return (
    <span className={cn('flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <LogoMark />
      {!collapsed && <span className="text-base">StockFlow</span>}
    </span>
  );
}
