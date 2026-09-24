'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { applyStockMovement } from '@/lib/stock';
import { assertUnique } from '@/lib/unique-checks';
import { byIdSchema } from '@/lib/validations/catalog';
import {
  productArchiveSchema,
  productCreateSchema,
  productUpdateSchema,
} from '@/lib/validations/product';
import { createAction } from './guard';

/*
 * Product mutations. Every one goes through createAction() (permission check on
 * the server, then Zod), runs in a transaction with its AuditLog row, and never
 * writes Product.quantity: opening stock is an IN movement through
 * applyStockMovement(), the only code that changes stock.
 */

function revalidateProducts(id?: string) {
  revalidatePath('/products');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  if (id) revalidatePath(`/products/${id}`);
}

/** Checks that the chosen category/supplier still exist, with messages on the fields. */
async function assertReferences(categoryId: string, supplierId: string | null) {
  const [category, supplier] = await Promise.all([
    prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }),
    supplierId
      ? prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } })
      : Promise.resolve({ id: null }),
  ]);
  const fieldErrors: Record<string, string[]> = {};
  if (!category) fieldErrors.categoryId = ['This category no longer exists. Pick another one.'];
  if (!supplier) fieldErrors.supplierId = ['This supplier no longer exists. Pick another one.'];
  if (Object.keys(fieldErrors).length) throw new ValidationError(undefined, fieldErrors);
}

export const createProduct = createAction(
  { permission: 'product:create', schema: productCreateSchema },
  async ({ initialQuantity, ...fields }, { user }) => {
    await assertUnique('productSku', fields.sku);
    await assertReferences(fields.categoryId, fields.supplierId);
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...fields, quantity: 0 },
        select: { id: true, name: true },
      });
      await audit(tx, {
        userId: user.id,
        action: 'product.create',
        entity: 'Product',
        entityId: created.id,
      });
      if (initialQuantity && initialQuantity > 0) {
        await applyStockMovement(tx, {
          productId: created.id,
          type: 'IN',
          quantity: initialQuantity,
          reason: 'Opening stock',
          userId: user.id,
        });
      }
      return created;
    });
    revalidateProducts(product.id);
    revalidatePath('/movements');
    return product;
  },
);

export const updateProduct = createAction(
  { permission: 'product:update', schema: productUpdateSchema },
  async ({ id, ...fields }, { user }) => {
    await assertUnique('productSku', fields.sku, id);
    await assertReferences(fields.categoryId, fields.supplierId);
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: fields,
        select: { id: true, name: true },
      });
      await audit(tx, {
        userId: user.id,
        action: 'product.update',
        entity: 'Product',
        entityId: id,
      });
      return updated;
    });
    revalidateProducts(id);
    return product;
  },
);

/** Archive (soft delete) or restore. Archived products keep their history but cannot move stock. */
export const setProductArchived = createAction(
  { permission: 'product:archive', schema: productArchiveSchema },
  async ({ id, archived }, { user }) => {
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { archived },
        select: { id: true, name: true, archived: true },
      });
      await audit(tx, {
        userId: user.id,
        action: archived ? 'product.archive' : 'product.unarchive',
        entity: 'Product',
        entityId: id,
      });
      return updated;
    });
    revalidateProducts(id);
    return product;
  },
);

/**
 * Permanent delete, ADMIN and DEMO only. A product with stock movements cannot be
 * deleted - the history (and the stock figures derived from it) must stay intact;
 * archive it instead.
 */
export const deleteProduct = createAction(
  { permission: 'product:delete', schema: byIdSchema },
  async ({ id }, { user }) => {
    const deleted = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id },
        select: { id: true, name: true, _count: { select: { movements: true } } },
      });
      if (!product) throw new NotFoundError('This product no longer exists.');
      const history = product._count.movements;
      if (history > 0) {
        throw new ConflictError(
          `"${product.name}" has ${history} stock ${history === 1 ? 'movement' : 'movements'}, so it cannot be deleted. Archive it instead to keep its history.`,
        );
      }
      await tx.product.delete({ where: { id } });
      await audit(tx, {
        userId: user.id,
        action: 'product.delete',
        entity: 'Product',
        entityId: id,
      });
      return { id: product.id, name: product.name };
    });
    revalidateProducts();
    return deleted;
  },
);
