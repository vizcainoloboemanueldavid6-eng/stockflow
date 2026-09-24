import { signOut } from '@/lib/auth';

/**
 * Clears the session cookie and returns to /login. Used when a valid JWT points at
 * an account that no longer exists (a server component cannot modify cookies, so
 * the (app) layout redirects here). The menu's "Sign out" uses the server action.
 */
export async function GET() {
  await signOut({ redirectTo: '/login' });
}
