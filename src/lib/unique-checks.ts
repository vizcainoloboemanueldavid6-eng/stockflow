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
type Check = {
  field: string;
  message: string;
  /** Ids of the records that already hold this value. */
  find: (value: string) => Promise<{ id: string }[]>;
};

const asList = (row: { id: string } | null) => (row ? [row] : []);

/** Category names compare without case or surrounding spaces: "audio" duplicates "Audio". */
export const categoryNameKey = (name: string) => name.trim().toLocaleLowerCase('en-US');

const CHECKS = {
  productSku: {
    field: 'sku',
    message: 'Another product already uses this SKU.',
    find: async (value: string) =>
      asList(await prisma.product.findUnique({ where: { sku: value }, select: { id: true } })),
  },
  categoryName: {
    field: 'name',
    message: 'A category with this name already exists.',
    // SKUs and emails are normalised by their schemas; category names keep the case the
    // user typed, so the comparison ignores it. A shop has a few dozen categories at
    // most, and reading them all works the same on PostgreSQL and SQLite.
    find: async (value: string) => {
      const key = categoryNameKey(value);
      const categories = await prisma.category.findMany({ select: { id: true, name: true } });
      return categories.filter((category) => categoryNameKey(category.name) === key);
    },
  },
  userEmail: {
    field: 'email',
    message: 'An account with this email already exists.',
    find: async (value: string) =>
      asList(await prisma.user.findUnique({ where: { email: value }, select: { id: true } })),
  },
} satisfies Record<string, Check>;

export async function assertUnique(
  kind: keyof typeof CHECKS,
  value: string,
  exceptId?: string,
): Promise<void> {
  const check: Check = CHECKS[kind];
  const existing = await check.find(value);
  if (existing.some((row) => row.id !== exceptId)) {
    throw new ValidationError(check.message, { [check.field]: [check.message] });
  }
}
