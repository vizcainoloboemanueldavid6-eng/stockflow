/**
 * CSV writer for the report exports (RFC 4180 + what Excel needs).
 *
 * - Fields containing a comma, a double quote, CR or LF - or starting/ending with
 *   whitespace - are wrapped in double quotes; inner quotes are doubled.
 * - Rows end with CRLF.
 * - The file starts with a UTF-8 byte-order mark so Excel reads accents and symbols
 *   correctly instead of guessing a legacy code page.
 * - Text cells that start with = + - @ TAB or CR get a leading apostrophe, so a
 *   product name such as "=HYPERLINK(...)" is shown as text, not run as a formula
 *   (OWASP "CSV injection"). Numbers are written as numbers and never prefixed, so
 *   a negative adjustment stays -2.
 */

export const CSV_BOM = '﻿';

export type CsvValue = string | number | boolean | Date | null | undefined;

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  let text = value instanceof Date ? value.toISOString() : value;
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: readonly CsvValue[]): string {
  return values.map(csvCell).join(',');
}

/** Header + rows, CRLF line endings, trailing newline. No BOM (see csvResponse). */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [header, ...rows].map(csvRow).join('\r\n') + '\r\n';
}

/** Money as a plain two-decimal number ("1234.50"): no currency sign, no separators. */
export function csvMoney(amount: number): string {
  return amount.toFixed(2);
}

/** "stockflow-products-2026-09-24.csv" */
export function csvFilename(kind: string, day: string): string {
  const safeKind = kind.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return `stockflow-${safeKind}-${day}.csv`;
}

/** A download response: BOM + body, UTF-8, attachment with the given (ASCII) filename. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(CSV_BOM + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
