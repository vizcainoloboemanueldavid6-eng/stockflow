import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The Credentials provider's check (src/lib/credentials.ts) with the database mocked:
 * rate limiting (sequential and simultaneous attempts, spoofed proxy headers), and the
 * DEMO_ENABLED switch, which must also close the demo account's email/password login.
 */
const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));

const { verifyCredentials } = await import('@/lib/credentials');

const hash = bcrypt.hashSync('Right#2026', 4);
const accounts: Record<string, { role: 'ADMIN' | 'STAFF' | 'DEMO' }> = {
  'admin@stockflow.test': { role: 'ADMIN' },
  'staff@stockflow.test': { role: 'STAFF' },
  'demo@stockflow.test': { role: 'DEMO' },
};

beforeEach(() => {
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('TRUST_PROXY', '');
  vi.stubEnv('DEMO_ENABLED', 'true');
  mocks.findUnique.mockReset();
  mocks.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) => {
    const account = accounts[where.email];
    return account
      ? {
          id: `${account.role}-id`,
          name: account.role,
          email: where.email,
          passwordHash: hash,
          ...account,
        }
      : null;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const attempt = (email: string, password: string, headers?: Headers) =>
  verifyCredentials({ email, password }, headers ?? new Headers());

/** Fresh limiter key per test: an email nobody else uses (unknown emails are counted too). */
const unknownEmail = () => `probe.${Math.random().toString(36).slice(2)}@example.test`;

describe('verifyCredentials', () => {
  it('signs in with the right password', async () => {
    await expect(attempt('admin@stockflow.test', 'Right#2026')).resolves.toMatchObject({
      ok: true,
      user: { id: 'ADMIN-id', role: 'ADMIN' },
    });
  });

  it('refuses a wrong password, then rate limits after five failures', async () => {
    const email = unknownEmail();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await attempt(email, `wrong-${i}`));
    expect(results.map((r) => (r.ok ? 'ok' : r.reason))).toEqual([
      ...Array(5).fill('invalid_credentials'),
      'rate_limited',
      'rate_limited',
    ]);
  });

  it('counts simultaneous attempts: a burst cannot slip past the limit', async () => {
    // Before the fix, check() and hit() were separated by the database lookup and the
    // bcrypt comparison, and 30 simultaneous guesses all reached the password check.
    const email = unknownEmail();
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => attempt(email, `guess-${i}`)),
    );
    const reasons = results.map((r) => (r.ok ? 'ok' : r.reason));
    expect(reasons.filter((r) => r === 'invalid_credentials')).toHaveLength(5);
    expect(reasons.filter((r) => r === 'rate_limited')).toHaveLength(25);
    expect(mocks.findUnique).toHaveBeenCalledTimes(5);
  });

  it('a spoofed X-Forwarded-For does not buy a fresh bucket', async () => {
    const email = unknownEmail();
    const results = [];
    for (let i = 0; i < 6; i++) {
      const headers = new Headers({ 'x-forwarded-for': `198.51.100.${i + 1}` });
      results.push(await attempt(email, 'wrong', headers));
    }
    expect(results.at(-1)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('a successful sign-in clears the failures', async () => {
    for (let i = 0; i < 4; i++) await attempt('staff@stockflow.test', 'wrong');
    await expect(attempt('staff@stockflow.test', 'Right#2026')).resolves.toMatchObject({
      ok: true,
    });
    for (let i = 0; i < 4; i++) {
      await expect(attempt('staff@stockflow.test', 'wrong')).resolves.toEqual({
        ok: false,
        reason: 'invalid_credentials',
      });
    }
    await attempt('staff@stockflow.test', 'Right#2026');
  });

  it('never rate limits the public demo account ("Try the demo" must keep working)', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(attempt('demo@stockflow.test', 'wrong')).resolves.toEqual({
        ok: false,
        reason: 'invalid_credentials',
      });
    }
    await expect(attempt('demo@stockflow.test', 'Right#2026')).resolves.toMatchObject({
      ok: true,
      user: { role: 'DEMO' },
    });
  });

  it('with DEMO_ENABLED=false a DEMO account cannot sign in, even with its password', async () => {
    vi.stubEnv('DEMO_ENABLED', 'false');
    await expect(attempt('demo@stockflow.test', 'Right#2026')).resolves.toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
    // ...and, no longer a public account, it is rate limited like any other.
    for (let i = 0; i < 4; i++) await attempt('demo@stockflow.test', 'Right#2026');
    await expect(attempt('demo@stockflow.test', 'Right#2026')).resolves.toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    // Other roles are unaffected.
    await expect(attempt('admin@stockflow.test', 'Right#2026')).resolves.toMatchObject({
      ok: true,
    });
  });
});
