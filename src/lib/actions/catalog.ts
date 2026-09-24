'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { assertUnique } from '@/lib/unique-checks';
import {
  byIdSchema,
  categorySchema,
  categoryUpdateSchema,
  supplierSchema,
  supplierUpdateSchema,
} from '@/lib/validations/catalog';
import { createAction } from './guard';

/*
 * Categories and suppliers. Create/update/delete each need their own permission
 * (STAFF has none of them); deletes are refused while products - archived ones
 * included - still point at the record, with a message saying how many.
 */

function revalidateCatalog(path: '/categories' | '/suppliers') {
  revalidatePath(path);
  revalidatePath('/products');
  revalidatePath('/reports');
  revalidatePath('/dashboard');
}

function stillUsedMessage(kind: 'category' | 'supplier', name: string, count: number) {
  const products = count === 1 ? '1 product' : `${count} products`;
  const fix =
    kind === 'category'
      ? 'Move those products to another category first.'
      : 'Assign those products to another supplier (or none) first.';
  return `"${name}" is still used by ${products} (archived ones included), so it cannot be deleted. ${fix}`;
}

export const createCategory = createAction(
  { permission: 'category:create', schema: categorySchema },
  async (input, { user }) => {
    await assertUnique('categoryName', input.name);
    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({ data: input, select: { id: true, name: true } });
      await audit(tx, {
        userId: user.id,
        action: 'category.create',
        entity: 'Category',
        entityId: created.id,
      });
      return created;
    });
    revalidateCatalog('/categories');
    return category;
  },
);

export const updateCategory = createAction(
  { permission: 'category:update', schema: categoryUpdateSchema },
  async ({ id, ...data }, { user }) => {
    await assertUnique('categoryName', data.name, id);
    const category = await prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data,
        select: { id: true, name: true },
      });
      await audit(tx, {
        userId: user.id,
        action: 'category.update',
        entity: 'Category',
        entityId: id,
      });
      return updated;
    });
    revalidateCatalog('/categories');
    return category;
  },
);

export const deleteCategory = createAction(
  { permission: 'category:delete', schema: byIdSchema },
  async ({ id }, { user }) => {
    const deleted = await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id },
        select: { id: true, name: true, _count: { select: { products: true } } },
      });
      if (!category) throw new NotFoundError('This category no longer exists.');
      if (category._count.products > 0) {
        throw new ConflictError(
          stillUsedMessage('category', category.name, category._count.products),
        );
      }
      await tx.category.delete({ where: { id } });
      await audit(tx, {
        userId: user.id,
        action: 'category.delete',
        entity: 'Category',
        entityId: id,
      });
      return { id, name: category.name };
    });
    revalidateCatalog('/categories');
    return deleted;
  },
);

export const createSupplier = createAction(
  { permission: 'supplier:create', schema: supplierSchema },
  async (input, { user }) => {
    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({ data: input, select: { id: true, name: true } });
      await audit(tx, {
        userId: user.id,
        action: 'supplier.create',
        entity: 'Supplier',
        entityId: created.id,
      });
      return created;
    });
    revalidateCatalog('/suppliers');
    return supplier;
  },
);

export const updateSupplier = createAction(
  { permission: 'supplier:update', schema: supplierUpdateSchema },
  async ({ id, ...data }, { user }) => {
    const supplier = await prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({
        where: { id },
        data,
        select: { id: true, name: true },
      });
      await audit(tx, {
        userId: user.id,
        action: 'supplier.update',
        entity: 'Supplier',
        entityId: id,
      });
      return updated;
    });
    revalidateCatalog('/suppliers');
    return supplier;
  },
);

export const deleteSupplier = createAction(
  { permission: 'supplier:delete', schema: byIdSchema },
  async ({ id }, { user }) => {
    const deleted = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id },
        select: { id: true, name: true, _count: { select: { products: true } } },
      });
      if (!supplier) throw new NotFoundError('This supplier no longer exists.');
      if (supplier._count.products > 0) {
        throw new ConflictError(
          stillUsedMessage('supplier', supplier.name, supplier._count.products),
        );
      }
      await tx.supplier.delete({ where: { id } });
      await audit(tx, {
        userId: user.id,
        action: 'supplier.delete',
        entity: 'Supplier',
        entityId: id,
      });
      return { id, name: supplier.name };
    });
    revalidateCatalog('/suppliers');
    return deleted;
  },
);
