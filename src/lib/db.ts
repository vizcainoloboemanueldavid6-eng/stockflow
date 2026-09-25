import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { escapeLikePattern, hasLikeWildcard } from './like';
import { createPrismaClient, databaseProvider } from './prisma-client';

/**
 * The app's single PrismaClient. Cached on globalThis in development so hot
 * reloads do not open a new connection pool on every edit.
 * In SQLite mode, creating it copies the bundled database to os.tmpdir() the
 * first time this module is loaded in an instance (see prisma-client.ts).
 */
const globalForPrisma = globalThis as unknown as { __stockflowPrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__stockflowPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.__stockflowPrisma = prisma;

/** True in the zero-external-service demo mode (DATABASE_PROVIDER=sqlite). */
export const isSqlite = databaseProvider() === 'sqlite';

/**
 * Products whose name or SKU contains `query`, case-insensitively, with `%` and `_`
 * taken literally, on both providers (the search box, the CSV export, Ctrl+K).
 *
 * - PostgreSQL: ILIKE (`mode: 'insensitive'`) with the wildcards escaped. SQLite's
 *   generated client has no `mode` field at all, so the property is added only at
 *   runtime and the static type stays the portable subset.
 * - SQLite: LIKE is already case-insensitive (ASCII) but has no default escape
 *   character, so text with a wildcard in it is matched with instr() instead, in one
 *   small raw query whose ids feed the Prisma filter. Plain text keeps using LIKE.
 */
export async function productTextWhere(query: string): Promise<Prisma.ProductWhereInput> {
  if (!isSqlite) {
    const filter = {
      contains: escapeLikePattern(query),
      mode: 'insensitive',
    } as Prisma.StringFilter;
    return { OR: [{ name: filter }, { sku: filter }] };
  }
  if (!hasLikeWildcard(query)) {
    return { OR: [{ name: { contains: query } }, { sku: { contains: query } }] };
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Product"
    WHERE instr(lower("name"), lower(${query})) > 0 OR instr(lower("sku"), lower(${query})) > 0`;
  return { id: { in: rows.map((row) => row.id) } };
}

/** Products at or below their reorder level (includes out of stock). Column-to-column comparison. */
export function lowStockWhere(): Prisma.ProductWhereInput {
  return { archived: false, quantity: { lte: prisma.product.fields.reorderLevel } };
}

/** Prisma returns Decimal for money columns; client components need plain numbers. */
export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}
