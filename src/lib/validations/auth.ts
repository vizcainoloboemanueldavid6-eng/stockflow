import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  // No strength rules at sign-in: the stored hash is the only judge.
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, 'Enter your password.')
    .max(200, 'Password is too long.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: nameSchema('Name', { min: 2, max: 80 }),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string({ error: 'Repeat the password.' }).min(1, 'Repeat the password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });
export type RegisterInput = z.infer<typeof registerSchema>;
