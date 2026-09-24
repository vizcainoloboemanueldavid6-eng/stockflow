import type { Prisma } from '@prisma/client';
import type { MovementType } from '@/lib/constants';
import { InsufficientStockError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * THE ONLY CODE PATH THAT CHANGES Product.quantity.
 *
 * Everything that moves stock - the movements form, product creation with opening
 * stock, the seed - goes through applyStockMovement(), always inside
 * prisma.$transaction, so the quantity change, the StockMovement row and the
 * AuditLog row commit or roll back together.
 *
 * Concurrency: a decrease is a single conditional UPDATE
 *   UPDATE "Product" SET quantity = quantity - n WHERE id = ? AND quantity >= n AND archived = false
 * The database evaluates the condition against the row it locks, so two
 * concurrent OUTs of 7 units against a stock of 10 cannot both succeed: the
 * second one matches zero rows and fails with InsufficientStockError. There is
 * no read-then-write window to race through.
 *
 * Quantity semantics (DECISIONS.md "Adjustment semantics"):
 *   IN          +quantity (quantity > 0)
 *   OUT         -quantity (quantity > 0)
 *   ADJUSTMENT  signed delta, stored signed (quantity != 0)
 * so for every product: Product.quantity = sum of signedDelta() over its movements.
 */

export type StockMovementRequest = {
  productId: string;
  type: MovementType;
  /** Units for IN/OUT (positive); signed delta for ADJUSTMENT (non-zero). */
  quantity: number;
  reason?: string | null;
  /** Acting user; null only for system jobs. */
  userId: string | null;
  /** Override the timestamp (seed data only). */
  createdAt?: Date;
};

export type StockMovementResult = {
  movement: {
    id: string;
    productId: string;
    type: MovementType;
    quantity: number;
    reason: string | null;
    userId: string | null;
    createdAt: Date;
  };
  product: { id: string; sku: string; name: string; quantity: number; reorderLevel: number };
  /** Signed change applied to Product.quantity. */
  delta: number;
};

/** Minimal slice of Prisma.TransactionClient this module needs (keeps it unit-testable). */
export type StockTx = Pick<Prisma.TransactionClient, 'product' | 'stockMovement' | 'auditLog'>;

/** Signed change a movement applies to the product's quantity. Throws on invalid input. */
export function signedDelta(type: MovementType, quantity: number): number {
  if (!Number.isSafeInteger(quantity)) {
    throw new ValidationError('Quantity must be a whole number.', {
      quantity: ['Quantity must be a whole number.'],
    });
  }
  switch (type) {
    case 'IN':
    case 'OUT':
      if (quantity < 1) {
        throw new ValidationError('Quantity must be at least 1.', {
          quantity: ['Quantity must be at least 1.'],
        });
      }
      return type === 'IN' ? quantity : -quantity;
    case 'ADJUSTMENT':
      if (quantity === 0) {
        throw new ValidationError('An adjustment must add or remove at least one unit.', {
          quantity: ['An adjustment must add or remove at least one unit.'],
        });
      }
      return quantity;
    default:
      throw new ValidationError('Unknown movement type.');
  }
}

/**
 * Pure version of the rule, for previews in the UI and for tests:
 * the quantity after the movement, or an InsufficientStockError.
 */
export function nextQuantity(current: number, type: MovementType, quantity: number): number {
  const delta = signedDelta(type, quantity);
  const result = current + delta;
  if (result < 0) throw new InsufficientStockError(current, -delta);
  return result;
}

/** Delta for an ADJUSTMENT that brings the stock to a physically counted figure. */
export function adjustmentDeltaForCount(current: number, counted: number): number {
  if (!Number.isSafeInteger(counted) || counted < 0) {
    throw new ValidationError('The counted quantity must be a whole number of zero or more.');
  }
  return counted - current;
}

export async function applyStockMovement(
  tx: StockTx,
  request: StockMovementRequest,
): Promise<StockMovementResult> {
  const delta = signedDelta(request.type, request.quantity);
  const { productId } = request;

  const updated =
    delta < 0
      ? await tx.product.updateMany({
          where: { id: productId, archived: false, quantity: { gte: -delta } },
          data: { quantity: { decrement: -delta } },
        })
      : await tx.product.updateMany({
          where: { id: productId, archived: false },
          data: { quantity: { increment: delta } },
        });

  if (updated.count !== 1) {
    // Nothing matched: work out why, to give the user a precise message.
    const current = await tx.product.findUnique({
      where: { id: productId },
      select: { quantity: true, archived: true },
    });
    if (!current) throw new NotFoundError('Product not found.');
    if (current.archived) {
      throw new ValidationError('This product is archived. Restore it before moving stock.');
    }
    throw new InsufficientStockError(current.quantity, -delta);
  }

  const product = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: { id: true, sku: true, name: true, quantity: true, reorderLevel: true },
  });

  // Defence in depth: the conditional update makes this unreachable, but if a
  // future change broke it, the transaction still refuses to commit.
  if (product.quantity < 0) throw new InsufficientStockError(product.quantity - delta, -delta);

  const movement = await tx.stockMovement.create({
    data: {
      productId,
      type: request.type,
      quantity: request.type === 'ADJUSTMENT' ? delta : request.quantity,
      reason: request.reason?.trim() || null,
      userId: request.userId,
      ...(request.createdAt ? { createdAt: request.createdAt } : {}),
    },
    select: {
      id: true,
      productId: true,
      type: true,
      quantity: true,
      reason: true,
      userId: true,
      createdAt: true,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: request.userId,
      action: `stock.${request.type.toLowerCase()}`,
      entity: 'StockMovement',
      entityId: movement.id,
      ...(request.createdAt ? { createdAt: request.createdAt } : {}),
    },
  });

  return { movement, product, delta };
}
