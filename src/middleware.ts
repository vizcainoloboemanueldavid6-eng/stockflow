import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

/**
 * Protects every route except the ones excluded by the matcher below.
 * Runs on the Edge runtime with the edge-safe config: it only verifies the JWT
 * cookie. Role checks happen on the server in requirePermission(), never here.
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Everything except:
     * - /api/auth/*  Auth.js endpoints (sign-in callbacks, CSRF, session)
     * - /api/cron/*  protected by the CRON_SECRET bearer token instead of a session
     * - Next.js internals and static files (anything with a file extension)
     */
    '/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)',
  ],
};
