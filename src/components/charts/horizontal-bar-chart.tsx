'use client';

import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/format';
import { ChartTooltipContent, TruncatedTick } from './chart-parts';

export type BarDatum = { key: string; label: string; value: number };

/**
 * How values are printed. A name rather than a function because server components
 * render this chart, and functions cannot cross the server/client boundary.
 */
export type BarValueFormat = 'number' | 'currency';

const FORMATTERS: Record<BarValueFormat, (value: number) => string> = {
  number: formatNumber,
  currency: formatCurrency,
};

const BAR_COLOR = 'hsl(var(--chart-1))';
const ROW_HEIGHT = 40;

/**
 * One series of horizontal bars (best sellers, valuation by category): one colour
 * for every bar, 20px bars with a 4px rounded end, the value at the tip, long names
 * truncated on the axis (full name in the tooltip and the hidden table).
 */
export function HorizontalBarChart({
  data,
  seriesName,
  valueFormat = 'number',
  labelWidth = 150,
  maxLabelChars = 20,
  caption,
}: {
  data: BarDatum[];
  seriesName: string;
  valueFormat?: BarValueFormat;
  labelWidth?: number;
  maxLabelChars?: number;
  caption: string;
}) {
  const valueFormatter = FORMATTERS[valueFormat];
  return (
    <figure>
      <div aria-hidden="true">
        <BarChart
          layout="vertical"
          responsive
          accessibilityLayer={false}
          style={{ width: '100%', height: data.length * ROW_HEIGHT + 8 }}
          data={data}
          margin={{ top: 4, right: valueFormat === 'currency' ? 96 : 48, bottom: 4, left: 0 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={(props) => <TruncatedTick {...props} maxChars={maxLabelChars} />}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.6 }}
            content={(props) => (
              <ChartTooltipContent
                active={props.active}
                payload={props.payload}
                label={props.label}
                valueFormatter={valueFormatter}
              />
            )}
          />
          <Bar
            dataKey="value"
            name={seriesName}
            fill={BAR_COLOR}
            barSize={20}
            radius={[0, 4, 4, 0]}
            animationDuration={500}
          >
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              fill="hsl(var(--foreground))"
              fontSize={12}
              formatter={(value) => valueFormatter(Number(value ?? 0))}
            />
          </Bar>
        </BarChart>
      </div>
      {/* The wrapper, not the table, is visually hidden: a table grows to fit its
          longest row whatever its own width says, and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key}>
                <th scope="row">{datum.label}</th>
                <td>{valueFormatter(datum.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
