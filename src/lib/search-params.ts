import type { z } from 'zod';

/**
 * URL search params <-> table state. Server pages parse them with the shared list
 * schemas (which never throw); client toolbars build the next URL with
 * nextSearch(), which drops empty and default values and returns to page 1
 * whenever a filter changes, so a URL always describes a reachable page.
 */

/** What Next.js passes to a page as (awaited) `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Keeps the first value of repeated keys and drops undefined ones. */
export function firstValues(raw: RawSearchParams | URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  if (raw instanceof URLSearchParams) {
    for (const [key, value] of raw) if (!(key in result)) result[key] = value;
    return result;
  }
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') result[key] = first;
  }
  return result;
}

/** Parses search params with a list schema; garbage never throws, it falls back to defaults. */
export function parseSearchParams<TSchema extends z.ZodType>(
  schema: TSchema,
  raw: RawSearchParams | URLSearchParams,
): z.output<TSchema> {
  const parsed = schema.safeParse(firstValues(raw));
  return parsed.success ? parsed.data : schema.parse({});
}

export type SearchUpdates = Record<string, string | number | null | undefined>;

/**
 * The query string after applying `updates` to `current`:
 * - null / undefined / '' / a value equal to `defaults[key]` removes the key;
 * - changing anything other than `page` removes `page` (back to the first page).
 * Returns '' or a string starting with '?', keys in a stable order.
 */
export function nextSearch(
  current: URLSearchParams | string,
  updates: SearchUpdates,
  defaults: Record<string, string | number> = {},
): string {
  const params = new URLSearchParams(current);
  let resetPage = false;
  for (const [key, raw] of Object.entries(updates)) {
    const value = raw === null || raw === undefined ? '' : String(raw).trim();
    const isDefault = key in defaults && String(defaults[key]) === value;
    if (!value || isDefault) params.delete(key);
    else params.set(key, value);
    if (key !== 'page') resetPage = true;
  }
  if (resetPage && !('page' in updates)) params.delete('page');
  if (params.get('page') === '1') params.delete('page');
  params.sort();
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Page count and a page number clamped into range (an out-of-range URL shows the last page). */
export function paginate(total: number, page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return { pageCount, page: current, skip: (current - 1) * pageSize, take: pageSize };
}
