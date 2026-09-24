'use server';

import { AuthError, type CredentialsSignin } from 'next-auth';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { HOME_PATH, safeCallbackPath } from '@/lib/auth.config';
import { hashPassword, signIn, signOut } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { demoEnabled, registrationEnabled, seedAccounts } from '@/lib/config';
import { prisma } from '@/lib/db';
import { RateLimitError } from '@/lib/errors';
import { clientIp, registerRateLimiter } from '@/lib/rate-limit';
import {
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
} from '@/lib/validations/auth';
import { fieldErrorsOf } from '@/lib/validations/common';
import { type ActionResult, toActionError } from './guard';

/*
 * Authentication actions. These are the only server actions that do not call
 * requirePermission(): they run *before* there is a user (login, demo, register)
 * or only end the session (logout). All other actions go through the guard.
 */

type AuthFailure = Extract<ActionResult<never>, { ok: false }>;

function signInFailure(error: AuthError): AuthFailure {
  if (error.type === 'CredentialsSignin') {
    const code = (error as CredentialsSignin).code;
    if (code === 'rate_limited') {
      return {
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Too many failed attempts. Wait 15 minutes and try again.',
      };
    }
    return { ok: false, code: 'UNAUTHORIZED', error: 'Invalid email or password.' };
  }
  console.error('[auth] sign-in failed', error);
  return { ok: false, code: 'INTERNAL', error: 'Sign-in failed. Please try again.' };
}

/** Signs in and redirects; resolves only with a failure (success throws NEXT_REDIRECT). */
async function credentialsSignIn(email: string, password: string, redirectTo: string) {
  try {
    await signIn('credentials', { email, password, redirectTo });
    return null;
  } catch (error) {
    if (error instanceof AuthError) return signInFailure(error);
    throw error; // NEXT_REDIRECT on success
  }
}

export async function login(
  input: LoginInput,
  callbackUrl?: string | null,
): Promise<AuthFailure | null> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      error: 'Please check the highlighted fields.',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  return credentialsSignIn(
    parsed.data.email,
    parsed.data.password,
    safeCallbackPath(callbackUrl, host),
  );
}

/** "Try the demo": signs in with the shared demo account (credentials from config). */
export async function loginAsDemo(): Promise<AuthFailure | null> {
  if (!demoEnabled()) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      error: 'The demo account is disabled on this deployment.',
    };
  }
  const { demo } = seedAccounts();
  const exists = await prisma.user.findUnique({
    where: { email: demo.email },
    select: { id: true },
  });
  if (!exists) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      error: 'The demo account is not set up yet. Run `npm run db:seed` first.',
    };
  }
  return credentialsSignIn(demo.email, demo.password, HOME_PATH);
}

/** Self-service sign-up. Always creates a STAFF user; off when ALLOW_REGISTRATION=false. */
export async function register(input: RegisterInput): Promise<AuthFailure | null> {
  if (!registrationEnabled()) {
    return { ok: false, code: 'FORBIDDEN', error: 'Registration is disabled on this deployment.' };
  }
  try {
    const ip = clientIp(await headers());
    const limit = registerRateLimiter.check(ip);
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterMs / 1000);

    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'VALIDATION',
        error: 'Please check the highlighted fields.',
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }
    const { name, email, password } = parsed.data;

    const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) {
      return {
        ok: false,
        code: 'CONFLICT',
        error: 'An account with this email already exists.',
        fieldErrors: { email: ['An account with this email already exists. Sign in instead.'] },
      };
    }

    registerRateLimiter.hit(ip);
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, role: 'STAFF' },
        select: { id: true },
      });
      await audit(tx, {
        userId: user.id,
        action: 'user.register',
        entity: 'User',
        entityId: user.id,
      });
    });

    return await credentialsSignIn(email, password, HOME_PATH);
  } catch (error) {
    unstable_rethrow(error); // NEXT_REDIRECT after a successful sign-in
    if (error instanceof AuthError) return signInFailure(error);
    return toActionError(error);
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}
