import 'server-only';
import bcrypt from 'bcryptjs';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/lib/auth.config';
import { BCRYPT_COST, verifyCredentials } from '@/lib/credentials';

export { BCRYPT_COST };

/** Error codes surfaced to the login form (see src/lib/actions/auth.ts). */
export class InvalidCredentialsError extends CredentialsSignin {
  code = 'invalid_credentials';
}
export class TooManyAttemptsError extends CredentialsSignin {
  code = 'rate_limited';
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
      // Runs for the login form and for direct POSTs to /api/auth/callback/credentials
      // alike, so the rate limit and the demo switch cannot be bypassed.
      async authorize(raw, request) {
        const result = await verifyCredentials(raw, request?.headers);
        if (result.ok) return result.user;
        if (result.reason === 'rate_limited') throw new TooManyAttemptsError();
        throw new InvalidCredentialsError();
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
