/**
 * Prisma's `contains` / `startsWith` / `endsWith` become SQL `LIKE` (`ILIKE` with
 * mode 'insensitive') WITHOUT escaping the text, so a search for "%" or "_" would match
 * every row. PostgreSQL's LIKE treats a backslash as the escape character by default,
 * so escaping the three special characters makes them literal there. SQLite's LIKE has
 * no default escape character and Prisma adds no ESCAPE clause, so SQLite needs a
 * different route (productTextWhere() in src/lib/db.ts).
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** True when the text contains a character LIKE would read as a wildcard. */
export function hasLikeWildcard(text: string): boolean {
  return /[%_]/.test(text);
}
