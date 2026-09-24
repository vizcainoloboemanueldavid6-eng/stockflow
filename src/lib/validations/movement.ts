import { z } from 'zod';
import { MOVEMENT_TYPES } from '@/lib/constants';
import { idSchema, integerSchema, listQuerySchema, optionalTextSchema } from './common';

export const MAX_MOVEMENT_QUANTITY = 1_000_000;

/**
 * Registering a movement.
 * - IN / OUT: `quantity` is a positive number of units.
 * - ADJUSTMENT: `quantity` is a signed, non-zero delta (e.g. -2 after a stock
 *   count found two missing units). See DECISIONS.md "Adjustment semantics".
 */
export const movementSchema = z
  .object({
    productId: idSchema,
    type: z.enum(MOVEMENT_TYPES, { error: 'Choose a movement type.' }),
    quantity: integerSchema('Quantity', {
      min: -MAX_MOVEMENT_QUANTITY,
      max: MAX_MOVEMENT_QUANTITY,
    }),
    reason: optionalTextSchema(200),
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'ADJUSTMENT' && value.quantity < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Quantity must be at least 1.',
      });
    }
    if (value.type === 'ADJUSTMENT' && value.quantity === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'An adjustment must add or remove at least one unit.',
      });
    }
  });
export type MovementInput = z.infer<typeof movementSchema>;

const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

/** URL search params of the /movements history. Dates are YYYY-MM-DD (inclusive). */
export const movementListQuerySchema = listQuerySchema.extend({
  from: dateParam,
  to: dateParam,
  type: z.enum(MOVEMENT_TYPES).optional().catch(undefined),
  user: z.string().trim().max(64).optional().catch(undefined),
  product: z.string().trim().max(64).optional().catch(undefined),
  dir: z.enum(['asc', 'desc']).catch('desc').default('desc'),
});
export type MovementListQuery = z.infer<typeof movementListQuerySchema>;
