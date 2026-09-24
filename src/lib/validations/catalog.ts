import { z } from 'zod';
import {
  hexColorSchema,
  idSchema,
  nameSchema,
  optionalEmailSchema,
  optionalTextSchema,
} from './common';

export const categorySchema = z.object({
  name: nameSchema('Name', { min: 2, max: 50 }),
  color: hexColorSchema,
});
export type CategoryInput = z.infer<typeof categorySchema>;
export const categoryUpdateSchema = categorySchema.extend({ id: idSchema });

export const supplierSchema = z.object({
  name: nameSchema('Name', { min: 2, max: 100 }),
  email: optionalEmailSchema,
  phone: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value) || null,
    z
      .string()
      .max(30, 'Phone number is too long.')
      .regex(/^[+\d][\d\s().-]*$/, 'Use digits, spaces and + ( ) - only.')
      .nullable(),
  ),
  notes: optionalTextSchema(1000),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
export const supplierUpdateSchema = supplierSchema.extend({ id: idSchema });

/** Delete/archive style actions that only need the record id. */
export const byIdSchema = z.object({ id: idSchema });
