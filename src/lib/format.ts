import { CURRENCY, LOCALE } from '@/lib/constants';
import { dayKey, wallClock } from '@/lib/dates';

/**
 * Display formatting. Server components format dates with the app time zone
 * (src/lib/dates.ts) and pass the text to client components; numbers and money
 * are zone-independent and can be formatted anywhere.
 */

const currency = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const compactCurrency = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });

export function formatCurrency(amount: number): string {
  return currency.format(amount);
}

/** "$12.4K" - for chart axes where space is short. */
export function formatCompactCurrency(amount: number): string {
  return compactCurrency.format(amount);
}

export function formatNumber(value: number): string {
  return integer.format(value);
}

/** Signed quantity for movement tables: "+12", "-3". */
export function formatSigned(value: number): string {
  return value > 0 ? `+${integer.format(value)}` : integer.format(value);
}

/** 0.253 -> "25.3%" */
export function formatPercent(ratio: number): string {
  return percent.format(ratio);
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string, withTime: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}|${withTime}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
    });
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/** "Sep 24, 2026" in the given zone. */
export function formatDate(date: Date, timeZone: string): string {
  return dateFormatter(timeZone, false).format(date);
}

/** "Sep 24, 2026, 14:05" in the given zone. */
export function formatDateTime(date: Date, timeZone: string): string {
  return dateFormatter(timeZone, true).format(date);
}

const shortDay = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});

/** "2026-09-24" -> "Sep 24" (a calendar day, so no zone conversion). */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return shortDay.format(new Date(Date.UTC(y, m - 1, d)));
}

/** "2026-09-24 14:05" - sortable timestamp for CSV files. */
export function formatIsoMinute(date: Date, timeZone: string): string {
  const { hour, minute } = wallClock(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${dayKey(date, timeZone)} ${pad(hour)}:${pad(minute)}`;
}
