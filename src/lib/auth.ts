import 'server-only';
import bcrypt from 'bcryptjs';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/lib/auth.config';
import { prisma } from '@/lib/db';
import { clientIp, loginRateLimiter } from '@/lib/rate-limit';
import { loginSchema } from '@/lib/validations/auth';

/** Error codes surfaced to the login form (see src/lib/actions/auth.ts). */
export class InvalidCredentialsError extends CredentialsSignin {
  code = 'invalid_credentials';
}
export class TooManyAttemptsError extends CredentialsSignin {
  code = 'rate_limited';
}

export const BCRYPT_COST = 10;

let timingHash: string | undefined;
/** Hash compared against when the email is unknown, so both paths cost one bcrypt check. */
function equalizerHash(): string {
  timingHash ??= bcrypt.hashSync('stockflow-timing-equalizer', BCRYPT_COST);
  return timingHash;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  logger: {
    // A wrong password is an expected outcome, not a server error: keep it out of the logs.
    error(error) {
      if ((error as { type?: string }).type === 'CredentialsSignin') return;
      console.error('[auth]', error);
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentialsError();
        const { email, password } = parsed.data;

        // Rate limit failed attempts per IP + email. This runs inside authorize()
        // so it also covers direct POSTs to /api/auth/callback/credentials.
        const key = `${clientIp(request?.headers)}|${email}`;
        if (!loginRateLimiter.check(key).allowed) throw new TooManyAttemptsError();

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, role: true, passwordHash: true },
        });
        const valid = await bcrypt.compare(password, user?.passwordHash ?? equalizerHash());

        if (!user || !valid) {
          loginRateLimiter.hit(key);
          throw new InvalidCredentialsError();
        }

        loginRateLimiter.reset(key);
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
