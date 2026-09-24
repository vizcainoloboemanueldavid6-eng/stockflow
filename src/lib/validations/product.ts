import { z } from 'zod';
import { STOCK_STATUSES } from '@/lib/constants';
import {
  idSchema,
  integerSchema,
  listQuerySchema,
  moneySchema,
  nameSchema,
  optionalHttpUrlSchema,
  optionalIdSchema,
  optionalTextSchema,
} from './common';

export const skuSchema = z
  .string({ error: 'Enter a SKU.' })
  .trim()
  .toUpperCase()
  .min(3, 'SKU must be at least 3 characters.')
  .max(32, 'SKU must be at most 32 characters.')
  .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Use letters, numbers and dashes only.');

/** Fields a user edits on a product. `quantity` is deliberately absent: stock only moves through movements. */
export const productFieldsSchema = z.object({
  sku: skuSchema,
  name: nameSchema('Name', { min: 2, max: 120 }),
  description: optionalTextSchema(1000),
  categoryId: idSchema,
  supplierId: optionalIdSchema,
  unitCost: moneySchema('Unit cost'),
  salePrice: moneySchema('Sale price'),
  reorderLevel: integerSchema('Reorder level', { min: 0, max: 100_000 }),
  imageUrl: optionalHttpUrlSchema,
});

/** Create: optional opening stock, recorded as an IN movement ("Opening stock") in the same transaction. */
export const productCreateSchema = productFieldsSchema.extend({
  initialQuantity: integerSchema('Opening stock', { min: 0, max: 1_000_000 }).optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = productFieldsSchema.extend({ id: idSchema });
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productArchiveSchema = z.object({ id: idSchema, archived: z.boolean() });

/** URL search params of the /products table. */
export const productListQuerySchema = listQuerySchema.extend({
  category: z.string().trim().max(64).optional().catch(undefined),
  supplier: z.string().trim().max(64).optional().catch(undefined),
  status: z.enum(STOCK_STATUSES).optional().catch(undefined),
  archived: z.enum(['active', 'archived', 'all']).catch('active').default('active'),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
