import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@/lib/constants';

/**
 * Edge-safe half of the Auth.js configuration: no Prisma, no bcrypt, no Node APIs.
 * The middleware (src/middleware.ts) runs NextAuth(authConfig) on the Edge runtime
 * to read the JWT cookie; src/lib/auth.ts extends it with the Credentials provider.
 */

/** Pages reachable without a session. Everything else is private. */
export const PUBLIC_PAGES = ['/login', '/register'];

/** Where a signed-in user lands (and where /login redirects when already signed in). */
export const HOME_PATH = '/dashboard';

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}

/**
 * Post-login destination, reduced to a same-origin path (no open redirect).
 * Auth.js puts an absolute URL in `callbackUrl`; it is accepted only when its host
 * equals `host` (the host the request came in on), and only its path is kept.
 */
export function safeCallbackPath(value: string | null | undefined, host?: string | null): string {
  if (!value || typeof value !== 'string') return HOME_PATH;
  let path = value;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      if (!host || url.host !== host || !/^https?:$/.test(url.protocol)) return HOME_PATH;
      path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return HOME_PATH;
    }
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return HOME_PATH;
  if (isPublicPath(path.split(/[?#]/)[0] ?? '')) return HOME_PATH;
  return path;
}

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const signedIn = Boolean(auth?.user);

      if (isPublicPath(pathname)) {
        if (signedIn) return Response.redirect(new URL(HOME_PATH, request.nextUrl));
        return true;
      }
      if (pathname.startsWith('/api/')) {
        // APIs answer 401 JSON instead of redirecting to an HTML page.
        return signedIn || Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // false => Auth.js redirects to /login?callbackUrl=<current URL>
      return signedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? '';
        session.user.role = (token.role ?? 'STAFF') as Role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
