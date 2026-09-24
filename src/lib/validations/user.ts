import { z } from 'zod';
import { ROLES } from '@/lib/constants';
import { emailSchema, idSchema, nameSchema, passwordSchema } from './common';

export const profileSchema = z.object({
  name: nameSchema('Name', { min: 2, max: 80 }),
  email: emailSchema,
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: 'Enter your current password.' })
      .min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z
      .string({ error: 'Repeat the new password.' })
      .min(1, 'Repeat the new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one.',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const roleSchema = z.enum(ROLES, { error: 'Choose a role.' });

export const userCreateSchema = z.object({
  name: nameSchema('Name', { min: 2, max: 80 }),
  email: emailSchema,
  role: roleSchema,
  password: passwordSchema,
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  id: idSchema,
  name: nameSchema('Name', { min: 2, max: 80 }),
  role: roleSchema,
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userSetPasswordSchema = z.object({ id: idSchema, password: passwordSchema });
