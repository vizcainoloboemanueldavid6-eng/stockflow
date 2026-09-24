import 'server-only';
import { prisma } from '@/lib/db';
import { ValidationError } from '@/lib/errors';

/**
 * Friendly pre-checks for the unique columns users type (SKU, category name,
 * email): the form gets a message under the right field, and the server log is
 * not filled with "Unique constraint failed" for an ordinary typo. The database
 * unique index stays the real guarantee - two simultaneous requests can still
 * both pass this check, and then toActionError() maps Prisma's P2002 to the same
 * kind of field error.
 */
const CHECKS = {
  productSku: {
    field: 'sku',
    message: 'Another product already uses this SKU.',
    find: (value: string) =>
      prisma.product.findUnique({ where: { sku: value }, select: { id: true } }),
  },
  categoryName: {
    field: 'name',
    message: 'A category with this name already exists.',
    find: (value: string) =>
      prisma.category.findUnique({ where: { name: value }, select: { id: true } }),
  },
  userEmail: {
    field: 'email',
    message: 'An account with this email already exists.',
    find: (value: string) =>
      prisma.user.findUnique({ where: { email: value }, select: { id: true } }),
  },
} as const;

export async function assertUnique(
  kind: keyof typeof CHECKS,
  value: string,
  exceptId?: string,
): Promise<void> {
  const check = CHECKS[kind];
  const existing = await check.find(value);
  if (existing && existing.id !== exceptId) {
    throw new ValidationError(check.message, { [check.field]: [check.message] });
  }
}
