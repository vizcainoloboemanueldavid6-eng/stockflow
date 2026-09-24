import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
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
 * Case-insensitive "contains" filter that works on both providers. PostgreSQL
 * needs `mode: 'insensitive'`; SQLite's LIKE is already case-insensitive and its
 * generated client has no `mode` field at all, so the property is added only at
 * runtime and the static type stays the portable subset.
 */
export function containsText(query: string): Prisma.StringFilter {
  return (
    isSqlite ? { contains: query } : { contains: query, mode: 'insensitive' }
  ) as Prisma.StringFilter;
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
