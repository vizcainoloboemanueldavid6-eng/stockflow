'use client';

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '@/lib/format';
import { AXIS_TICK, ChartTooltipContent, GRID_STROKE, LegendKey } from './chart-parts';

export type TrendPoint = { day: string; label: string; in: number; out: number };

const IN_COLOR = 'hsl(var(--chart-1))';
const OUT_COLOR = 'hsl(var(--chart-2))';

/**
 * Units received (IN) vs units sold (OUT) per day. Two 2px lines on one axis,
 * hairline grid, crosshair tooltip listing both series; a visually hidden table
 * carries the same numbers for screen readers.
 */
export function MovementTrendChart({
  data,
  totals,
}: {
  data: TrendPoint[];
  totals: { in: number; out: number };
}) {
  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1">
        <LegendKey color={IN_COLOR} label="Stock in" value={`${formatNumber(totals.in)} units`} />
        <LegendKey
          color={OUT_COLOR}
          label="Stock out"
          value={`${formatNumber(totals.out)} units`}
        />
      </figcaption>
      <div aria-hidden="true">
        <LineChart
          responsive
          accessibilityLayer={false}
          style={{ width: '100%', height: 260 }}
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
        >
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE }}
            tick={AXIS_TICK}
            minTickGap={28}
            interval="preserveStartEnd"
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            width={44}
            tickFormatter={(value: number) => formatNumber(value)}
          />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
            content={(props) => (
              <ChartTooltipContent
                active={props.active}
                payload={props.payload}
                label={props.label}
                valueFormatter={(value) => `${formatNumber(value)} units`}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="in"
            name="Stock in"
            stroke={IN_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            animationDuration={500}
          />
          <Line
            type="monotone"
            dataKey="out"
            name="Stock out"
            stroke={OUT_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            animationDuration={500}
          />
        </LineChart>
      </div>
      <table className="sr-only">
        <caption>Units in and out per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Stock in</th>
            <th scope="col">Stock out</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.label}</th>
              <td>{point.in}</td>
              <td>{point.out}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
