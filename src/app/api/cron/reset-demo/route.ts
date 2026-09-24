import { timingSafeEqual } from 'node:crypto';
import { demoEnabled } from '@/lib/config';
import { prisma } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Daily demo reset (vercel.json cron). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * Restores the database to the seed state - business data, the three seeded
 * accounts, and removes accounts created by visitors. Refuses to run unless
 * CRON_SECRET is configured and DEMO_ENABLED is not "false", so a production
 * deployment with real data is never wiped by the schedule.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!demoEnabled()) {
    return Response.json({ skipped: true, reason: 'DEMO_ENABLED=false' }, { status: 200 });
  }

  try {
    const started = Date.now();
    const summary = await seedDatabase(prisma, { mode: 'reset-demo' });
    return Response.json({ ok: true, ms: Date.now() - started, ...summary });
  } catch (error) {
    console.error('[cron] demo reset failed', error);
    return Response.json({ error: 'Demo reset failed.' }, { status: 500 });
  }
}
