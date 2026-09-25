import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Scale,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  MOVEMENT_TYPE_LABELS,
  type MovementType,
  STOCK_STATUS_LABELS,
  type StockStatus,
} from '@/lib/constants';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<
  StockStatus,
  { variant: 'success' | 'warning' | 'danger'; icon: typeof CircleCheck }
> = {
  in_stock: { variant: 'success', icon: CircleCheck },
  low_stock: { variant: 'warning', icon: CircleAlert },
  out_of_stock: { variant: 'danger', icon: CircleX },
};

/** Stock status with an icon and a label, never colour alone. */
export function StockStatusBadge({
  status,
  className,
}: {
  status: StockStatus;
  className?: string;
}) {
  const { variant, icon: Icon } = STATUS_STYLE[status];
  return (
    // Keyed by the status: a change replaces the badge instead of swapping the icon in front
    // of a text node, which crashes React on a translated page (src/lib/safe-text.tsx).
    <Badge key={status} variant={variant} className={className} data-status={status}>
      <Icon aria-hidden="true" />
      {STOCK_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Movement types are identity, not status: blue for stock in (like the chart), neutral otherwise. */
const MOVEMENT_STYLE: Record<
  MovementType,
  { variant: 'info' | 'secondary' | 'outline'; icon: typeof Scale }
> = {
  IN: { variant: 'info', icon: ArrowDownLeft },
  OUT: { variant: 'secondary', icon: ArrowUpRight },
  ADJUSTMENT: { variant: 'outline', icon: Scale },
};

export function MovementTypeBadge({ type }: { type: MovementType }) {
  const { variant, icon: Icon } = MOVEMENT_STYLE[type];
  return (
    <Badge key={type} variant={variant}>
      <Icon aria-hidden="true" />
      {MOVEMENT_TYPE_LABELS[type]}
    </Badge>
  );
}

/** Category name with its colour dot. */
export function CategoryLabel({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span
        className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {/* Wraps rather than truncates, even inside a no-wrap table cell: a table cannot
          shrink below one unbreakable word, so a long name without spaces would widen it. */}
      <span key={name} className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
        {name}
      </span>
    </span>
  );
}
