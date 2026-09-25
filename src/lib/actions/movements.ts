'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { applyStockMovement } from '@/lib/stock';
import { movementSchema } from '@/lib/validations/movement';
import { createAction } from './guard';

/**
 * Registers an IN / OUT / ADJUSTMENT movement. The whole change - product
 * quantity, StockMovement row, AuditLog row - is one transaction; a movement
 * that would leave negative stock fails with
 * "Not enough stock: X available, tried to remove Y." and changes nothing.
 */
export const registerMovement = createAction(
  { permission: 'movement:create', schema: movementSchema },
  async (input, { user }) => {
    const result = await prisma.$transaction((tx) =>
      applyStockMovement(tx, {
        productId: input.productId,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason,
        userId: user.id,
      }),
    );

    revalidatePath('/dashboard');
    revalidatePath('/movements');
    revalidatePath('/products');
    revalidatePath(`/products/${input.productId}`);

    const { quantity, reorderLevel } = result.product;
    const previousQuantity = quantity - result.delta;
    return {
      movementId: result.movement.id,
      productId: result.product.id,
      productName: result.product.name,
      quantity,
      reorderLevel,
      delta: result.delta,
      lowStock: quantity <= reorderLevel,
      /** This movement took it from above the reorder level to at or below it. */
      becameLow: previousQuantity > reorderLevel && quantity <= reorderLevel,
    };
  },
);
