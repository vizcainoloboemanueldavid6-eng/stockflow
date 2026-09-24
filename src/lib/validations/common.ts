import { z } from 'zod';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '@/lib/constants';

/**
 * Building blocks shared by every schema. Forms send strings, server actions may
 * receive numbers - the preprocessors accept both, and turn blank inputs into
 * `undefined`/`null` so "required" and "optional" behave the same on both sides.
 */

const blankToUndefined = (value: unknown) =>
  value === '' || value === null || (typeof value === 'string' && value.trim() === '')
    ? undefined
    : value;

const toNumber = (value: unknown) => {
  const v = blankToUndefined(value);
  return typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
};

export const idSchema = z
  .string({ error: 'This field is required.' })
  .trim()
  .min(1, 'This field is required.')
  .max(64, 'Invalid id.');

/** Optional foreign key: blank becomes null ("none"). */
export const optionalIdSchema = z.preprocess(
  (value) => blankToUndefined(value) ?? null,
  z.string().trim().max(64, 'Invalid id.').nullable(),
);

export const emailSchema = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(254, 'Email is too long.')
  .email('Enter a valid email address.');

/** Optional email: trimmed and lower-cased, blank becomes null. */
export const optionalEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value) || null,
  z.string().max(254, 'Email is too long.').email('Enter a valid email address.').nullable(),
);

export const passwordSchema = z
  .string({ error: 'Enter a password.' })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .refine(
    (value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES,
    'Password is too long.',
  )
  .refine(
    (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
    'Include at least one letter and one number.',
  );

export function nameSchema(label: string, { min = 2, max = 120 } = {}) {
  return z
    .string({ error: `Enter a ${label.toLowerCase()}.` })
    .trim()
    .min(
      min,
      min <= 1 ? `Enter a ${label.toLowerCase()}.` : `${label} must be at least ${min} characters.`,
    )
    .max(max, `${label} must be at most ${max} characters.`);
}

/** Optional free text: trimmed, blank becomes null. */
export function optionalTextSchema(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value) || null,
    z.string().max(max, `Keep it under ${max} characters.`).nullable(),
  );
}

export function integerSchema(label: string, { min = 0, max = 1_000_000 } = {}) {
  return z.preprocess(
    toNumber,
    z
      .number({ error: `Enter the ${label.toLowerCase()}.` })
      .int(`${label} must be a whole number.`)
      .min(min, `${label} must be at least ${min}.`)
      .max(max, `${label} must be at most ${max.toLocaleString('en-US')}.`),
  );
}

/** Non-negative amount with at most two decimals (prices and costs). */
export function moneySchema(label: string, { max = 1_000_000 } = {}) {
  return z.preprocess(
    toNumber,
    z
      .number({ error: `Enter the ${label.toLowerCase()}.` })
      .min(0, `${label} cannot be negative.`)
      .max(max, `${label} must be at most ${max.toLocaleString('en-US')}.`)
      .refine(
        (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
        `${label} can have at most two decimals.`,
      ),
  );
}

export const hexColorSchema = z
  .string({ error: 'Pick a colour.' })
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #2563EB.')
  .transform((value) => value.toUpperCase());

/** Only http(s) links - a bare z.url() would also accept javascript: URLs. */
export const optionalHttpUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value) || null,
  z
    .url({ protocol: /^https?$/, error: 'Enter a full http(s):// link.' })
    .max(500, 'Link is too long.')
    .nullable(),
);

/** Query-string parameters for server-side tables (search, sort, pagination). */
export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).catch(10).default(10),
  sort: z.string().trim().max(40).optional().catch(undefined),
  dir: z.enum(['asc', 'desc']).catch('asc').default('asc'),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** Flattens a ZodError into `{ field: [messages] }` for forms. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
