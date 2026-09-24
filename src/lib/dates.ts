/**
 * Calendar days in the business's time zone.
 *
 * "Movements today", the 30-day chart buckets, the history's date filters, CSV
 * timestamps and every date shown in the UI use ONE zone: `APP_TIME_ZONE` (an IANA
 * name such as "America/Bogota") or, when it is unset or invalid, the server's own
 * zone. Dates are formatted on the server and sent to the browser as text, so the
 * server render and the hydrated page always agree (no hydration mismatch when the
 * server runs in UTC and the visitor does not). See DECISIONS.md "Time zone".
 *
 * Pure functions (the zone is always a parameter) so they are unit-testable.
 */

/** YYYY-MM-DD */
export type DayKey = string;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The zone the app reports in: APP_TIME_ZONE when valid, otherwise the server's zone. */
export function appTimeZone(): string {
  const configured = process.env.APP_TIME_ZONE?.trim();
  if (configured && isValidTimeZone(configured)) return configured;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partFormatters.set(timeZone, formatter);
  }
  return formatter;
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Wall-clock reading of an instant in a zone. */
export function wallClock(date: Date, timeZone: string): WallClock {
  const parts = partFormatter(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** Calendar day (YYYY-MM-DD) of an instant in the zone. */
export function dayKey(date: Date, timeZone: string): DayKey {
  const { year, month, day } = wallClock(date, timeZone);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function isDayKey(value: string): value is DayKey {
  const match = DAY_KEY_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The day `days` after (or before, when negative) a day key. */
export function shiftDay(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Zone offset at an instant, in ms (wall clock minus UTC). */
function offsetAt(instant: number, timeZone: string): number {
  const wall = wallClock(new Date(instant), timeZone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return wallAsUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant a calendar day starts in the zone (handles DST: two passes). */
export function startOfDay(key: DayKey, timeZone: string): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  const firstGuess = midnightAsUtc - offsetAt(midnightAsUtc, timeZone);
  const offset = offsetAt(firstGuess, timeZone);
  return new Date(midnightAsUtc - offset);
}

/** The last `count` calendar days ending today (oldest first). */
export function lastDays(now: Date, count: number, timeZone: string): DayKey[] {
  const today = dayKey(now, timeZone);
  return Array.from({ length: count }, (_, index) => shiftDay(today, index - (count - 1)));
}

/**
 * Inclusive day range -> half-open instant range for a `createdAt` filter.
 * Invalid keys are ignored; a reversed range is swapped instead of returning nothing.
 */
export function dayRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
): { gte?: Date; lt?: Date } {
  let start = from && isDayKey(from) ? from : undefined;
  let end = to && isDayKey(to) ? to : undefined;
  if (start && end && start > end) [start, end] = [end, start];
  return {
    ...(start ? { gte: startOfDay(start, timeZone) } : {}),
    ...(end ? { lt: startOfDay(shiftDay(end, 1), timeZone) } : {}),
  };
}
