import type { PrismaClient } from '@prisma/client';
import { demoEnabled } from './config';
import { appTimeZone, dayKey } from './dates';
import { seedDatabase } from './seed';

/**
 * Keeps the zero-service SQLite demo (DATABASE_PROVIDER=sqlite) looking current.
 *
 * The build seeds the bundled database once, and every date in it - the 90 days of
 * movements, "today"'s movements - is relative to that moment. Each new server instance
 * starts from a copy of that file, so without this a deployment left alone for a month
 * would show an empty 30-day chart, no best sellers and no "movements today". When a new
 * copy is made, prisma-client.ts calls refreshDemoDataIfStale() before the app's first
 * query: data seeded on an earlier day, or more than an hour ago, is seeded again for now.
 */

/** Audit actions the seed writes, with the moment the data set was generated for. */
export const SEED_MARKERS = ['system.seed', 'system.demo-reset'];

const MAX_AGE_MS = 60 * 60_000;

export function demoDataIsStale(seededAt: Date | null, now: Date, timeZone: string): boolean {
  if (!seededAt) return true;
  if (now.getTime() - seededAt.getTime() > MAX_AGE_MS) return true;
  return dayKey(seededAt, timeZone) !== dayKey(now, timeZone);
}

/** Re-seeds the database behind `client` when its data set is stale; true when it did. */
export async function refreshDemoDataIfStale(
  client: PrismaClient,
  now = new Date(),
): Promise<boolean> {
  if (!demoEnabled()) return false;
  const marker = await client.auditLog.findFirst({
    where: { action: { in: SEED_MARKERS } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!demoDataIsStale(marker?.createdAt ?? null, now, appTimeZone())) return false;
  await seedDatabase(client, { mode: 'reset-demo', now });
  return true;
}
