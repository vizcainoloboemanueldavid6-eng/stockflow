/**
 * Runs before Playwright stops its web servers. On Windows those can only be
 * force-killed, so the e2e database script is asked to stop PostgreSQL gracefully
 * first (it only does so if it started the server itself).
 */
export default async function globalTeardown() {
  if (process.env.E2E_BASE_URL) return;
  const port = process.env.E2E_DB_READY_PORT ?? '3119';
  try {
    await fetch(`http://127.0.0.1:${port}/shutdown`, { signal: AbortSignal.timeout(30_000) });
  } catch {
    // Nothing to stop (the database script is not running).
  }
}
