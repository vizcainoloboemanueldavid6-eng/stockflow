import 'server-only';
import { Prisma } from '@prisma/client';
import { redirect, unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import type { z } from 'zod';
import { auth } from '@/lib/auth';
import { demoEnabled } from '@/lib/config';
import type { Role } from '@/lib/constants';
import { prisma } from '@/lib/db';
import {
  AppError,
  type AppErrorCode,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import { can, type Permission } from '@/lib/permissions';
import { fieldErrorsOf } from '@/lib/validations/common';

/**
 * Server-side authorization. Every server action and every private route handler
 * starts with requirePermission() - directly, or through createAction(), which
 * calls it before touching the input. The UI hiding a button is a convenience,
 * never the control.
 */

export type CurrentUser = { id: string; name: string; email: string; role: Role };

/**
 * The signed-in user, re-read from the database (memoised per request).
 * Reading the row instead of trusting the JWT means a role change or a deleted
 * account takes effect on the very next request, not when the token expires.
 * With DEMO_ENABLED=false a DEMO-role account counts as signed out, so a session
 * opened before the switch was flipped stops working too (the layout then clears it).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (user?.role === 'DEMO' && !demoEnabled()) return null;
  return user;
});

/** Throws UnauthorizedError when nobody is signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * THE guard. Throws UnauthorizedError / ForbiddenError; returns the fresh user otherwise.
 * `deniedMessage` replaces the generic refusal where the reason is worth explaining
 * (e.g. why the shared demo account cannot change its password).
 */
export async function requirePermission(
  permission: Permission,
  deniedMessage?: string,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) throw new ForbiddenError(deniedMessage);
  return user;
}

/**
 * For server components (pages): same check, but navigates instead of throwing -
 * guests go to /login, users without the permission back to the dashboard.
 */
export async function requirePagePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!can(user.role, permission)) redirect('/dashboard');
  return user;
}

export type ActionErrorCode = AppErrorCode | 'BUSY' | 'INTERNAL';

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Wraps a server action: permission check -> Zod parse -> handler -> typed result.
 *
 *   'use server';
 *   export const deleteSupplier = createAction(
 *     { permission: 'supplier:delete', schema: byIdSchema },
 *     async ({ id }, { user }) => { ...; return null; },
 *   );
 *
 * The client gets `{ ok: true, data }` or `{ ok: false, code, error, fieldErrors }`
 * and never an unhandled exception. redirect()/notFound() still propagate.
 */
export function createAction<TSchema extends z.ZodType, TResult>(
  config: { permission: Permission; schema: TSchema; deniedMessage?: string },
  handler: (input: z.output<TSchema>, context: { user: CurrentUser }) => Promise<TResult>,
): (input: z.input<TSchema>) => Promise<ActionResult<TResult>> {
  return async (input) => {
    try {
      const user = await requirePermission(config.permission, config.deniedMessage);
      const parsed = config.schema.safeParse(input);
      if (!parsed.success) {
        throw new ValidationError(undefined, fieldErrorsOf(parsed.error));
      }
      const data = await handler(parsed.data, { user });
      return { ok: true, data };
    } catch (error) {
      unstable_rethrow(error);
      return toActionError(error);
    }
  };
}

const FIELD_LABELS: Record<string, string> = { sku: 'SKU', email: 'email', name: 'name' };

/** Maps any thrown value to a failed ActionResult with a message safe to show. */
export function toActionError(error: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (error instanceof AppError) {
    return {
      ok: false,
      code: error.code,
      error: error.message,
      ...(error instanceof ValidationError && error.fieldErrors
        ? { fieldErrors: error.fieldErrors }
        : {}),
    };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const field = uniqueField(error.meta?.target);
      const label = field ? (FIELD_LABELS[field] ?? field) : 'value';
      const message = `A record with this ${label} already exists.`;
      return {
        ok: false,
        code: 'CONFLICT',
        error: message,
        ...(field ? { fieldErrors: { [field]: [message] } } : {}),
      };
    }
    if (error.code === 'P2003' || error.code === 'P2014') {
      return {
        ok: false,
        code: 'CONFLICT',
        error: 'This record is still used by other records, so it cannot be removed.',
      };
    }
    if (error.code === 'P2025') {
      return { ok: false, code: 'NOT_FOUND', error: 'The requested record no longer exists.' };
    }
  }
  if (isBusyError(error)) {
    console.warn('[action] database busy', (error as Error).message.split('\n')[0]);
    return { ok: false, code: 'BUSY', error: BUSY_MESSAGE };
  }
  console.error('[action] unexpected error', error);
  return { ok: false, code: 'INTERNAL', error: 'Something went wrong. Please try again.' };
}

export const BUSY_MESSAGE =
  'The system is busy with other changes right now. Nothing was saved; please try again.';

/**
 * Transient contention, not a bug: no connection or transaction slot in time (P2028),
 * an operation timed out (P1008), a write conflict or deadlock (P2034), or SQLite's
 * file lock ("database is locked"). The transaction was rolled back, so nothing changed.
 */
function isBusyError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P1008', 'P2028', 'P2034'].includes(error.code);
  }
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    /database is locked|SQLITE_BUSY/i.test(error.message)
  );
}

/** Postgres reports ["sku"]; SQLite may report "Product_sku_key" or ["sku"]. */
function uniqueField(target: unknown): string | undefined {
  if (Array.isArray(target) && typeof target[0] === 'string') return target[0];
  if (typeof target === 'string') {
    const match = target.match(/_([A-Za-z]+)_key$/);
    return match?.[1] ?? target;
  }
  return undefined;
}

/** For route handlers: converts a thrown error into a JSON response with the right status. */
export function errorResponse(error: unknown): Response {
  unstable_rethrow(error);
  if (error instanceof AppError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const result = toActionError(error);
  const status =
    result.code === 'CONFLICT'
      ? 409
      : result.code === 'NOT_FOUND'
        ? 404
        : result.code === 'BUSY'
          ? 503
          : 500;
  return Response.json({ error: result.error, code: result.code }, { status });
}
