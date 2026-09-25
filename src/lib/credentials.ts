import 'server-only';
import bcrypt from 'bcryptjs';
import type { Role } from '@/lib/constants';
import { demoEnabled, seedAccounts } from '@/lib/config';
import { prisma } from '@/lib/db';
import { clientIp, loginRateLimiter } from '@/lib/rate-limit';
import { loginSchema } from '@/lib/validations/auth';

/**
 * The email + password check behind the Auth.js Credentials provider (src/lib/auth.ts).
 * Kept apart from the NextAuth() call so it can be unit-tested with a mocked database.
 */

export const BCRYPT_COST = 10;

export type CredentialsResult =
  | { ok: true; user: { id: string; name: string; email: string; role: Role } }
  | { ok: false; reason: 'invalid_credentials' | 'rate_limited' };

let timingHash: string | undefined;
/** Hash compared against when the email is unknown, so both paths cost one bcrypt check. */
function equalizerHash(): string {
  timingHash ??= bcrypt.hashSync('stockflow-timing-equalizer', BCRYPT_COST);
  return timingHash;
}

/**
 * The public demo account's password is published and "Try the demo" signs in with it,
 * so limiting its failed attempts protects nothing - it would only let anyone lock the
 * one-click demo for everyone behind the same address.
 */
function isPublicDemoLogin(email: string): boolean {
  return demoEnabled() && email === seedAccounts().demo.email;
}

export async function verifyCredentials(
  raw: unknown,
  headers: Headers | null | undefined,
): Promise<CredentialsResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid_credentials' };
  const { email, password } = parsed.data;

  // Failed sign-ins per client + email. The attempt is recorded BEFORE the database
  // lookup and the bcrypt comparison (consume() checks and counts in one synchronous
  // step), so a burst of simultaneous guesses cannot all slip past the check; a
  // successful sign-in clears the key again.
  const limited = !isPublicDemoLogin(email);
  const key = `${clientIp(headers)}|${email}`;
  if (limited && !loginRateLimiter.consume(key).allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? equalizerHash());

  // With the demo switched off (a real deployment) a DEMO-role account is not a way in,
  // whatever its password: it reads exactly like a wrong password.
  const demoRefused = user?.role === 'DEMO' && !demoEnabled();
  if (!user || !valid || demoRefused) return { ok: false, reason: 'invalid_credentials' };

  if (limited) loginRateLimiter.reset(key);
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}
