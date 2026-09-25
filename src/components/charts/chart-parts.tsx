'use client';

import { Swap } from '@/lib/safe-text';

/**
 * Pieces shared by the Recharts charts. Colours come from theme tokens
 * (--chart-1 blue, --chart-2 orange, validated for both themes - DECISIONS.md
 * "Chart colours"); text always uses text tokens, never the series colour.
 */

export const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 12 } as const;
export const GRID_STROKE = 'hsl(var(--border))';

type TooltipItem = {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
  payload?: Record<string, unknown>;
};

/** Tooltip body: value first (strong), series name second, keyed by a short line. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  valueFormatter = (value) => String(value),
  labelFormatter,
}: {
  active?: boolean;
  payload?: readonly TooltipItem[];
  label?: unknown;
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: unknown, payload: readonly TooltipItem[]) => string;
}) {
  if (!active || !payload?.length) return null;
  const heading = labelFormatter ? labelFormatter(label, payload) : String(label ?? '');
  return (
    <div className="min-w-32 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {/* The tooltip follows the pointer: its texts are keyed so each point gets fresh
          elements, which browser translation handles (src/lib/safe-text.tsx). */}
      {heading && (
        <p key={heading} className="mb-1.5 font-medium text-muted-foreground">
          {heading}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((item) => (
          <li key={String(item.dataKey ?? item.name)} className="flex items-center gap-2">
            <span
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <Swap className="font-semibold tabular-nums text-foreground">
              {valueFormatter(Number(item.value ?? 0))}
            </Swap>
            <Swap className="text-muted-foreground">{String(item.name ?? '')}</Swap>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legend entry that mirrors the mark: a short line for line series, a square for bars. */
export function LegendKey({
  color,
  label,
  value,
  shape = 'line',
}: {
  color: string;
  label: string;
  value?: string;
  shape?: 'line' | 'square';
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={shape === 'line' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-sm'}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span key={label}>{label}</span>
      {value && (
        <span key={value} className="font-medium tabular-nums text-foreground">
          {value}
        </span>
      )}
    </span>
  );
}

/** Y-axis category label that truncates long names and keeps the full one in a tooltip. */
export function TruncatedTick({
  x,
  y,
  payload,
  maxChars = 18,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  maxChars?: number;
}) {
  const text = String(payload?.value ?? '');
  const short = text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
  return (
    <text
      x={Number(x ?? 0) - 8}
      y={Number(y ?? 0)}
      dy={4}
      textAnchor="end"
      fill="hsl(var(--muted-foreground))"
      fontSize={12}
    >
      <title key={text}>{text}</title>
      <tspan key={short}>{short}</tspan>
    </text>
  );
}
