import { describe, expect, it } from 'vitest';
import { clientIp, SlidingWindowRateLimiter, UNTRUSTED_CLIENT } from '@/lib/rate-limit';

function limiter(limit = 3, windowMs = 60_000) {
  let now = 1_000_000;
  const instance = new SlidingWindowRateLimiter({ limit, windowMs, now: () => now, maxKeys: 5 });
  return { instance, advance: (ms: number) => (now += ms) };
}

describe('SlidingWindowRateLimiter', () => {
  it('blocks after `limit` hits inside the window', () => {
    const { instance } = limiter();
    for (let i = 0; i < 3; i++) {
      expect(instance.check('k').allowed).toBe(true);
      instance.hit('k');
    }
    const blocked = instance.check('k');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterMs).toBe(60_000);
  });

  it('slides: old hits expire one by one', () => {
    const { instance, advance } = limiter();
    instance.hit('k');
    advance(20_000);
    instance.hit('k');
    advance(20_000);
    instance.hit('k');
    expect(instance.check('k').allowed).toBe(false);
    advance(20_001); // the first hit is now older than the window
    expect(instance.check('k').allowed).toBe(true);
    instance.hit('k');
    const blocked = instance.check('k');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterMs).toBe(19_999);
  });

  it('keeps keys independent and can reset one', () => {
    const { instance } = limiter(1);
    instance.hit('1.1.1.1|a@x.test');
    expect(instance.check('1.1.1.1|a@x.test').allowed).toBe(false);
    expect(instance.check('1.1.1.1|b@x.test').allowed).toBe(true);
    expect(instance.check('2.2.2.2|a@x.test').allowed).toBe(true);
    instance.reset('1.1.1.1|a@x.test');
    expect(instance.check('1.1.1.1|a@x.test').allowed).toBe(true);
  });

  it('bounds memory under a flood of unique keys', () => {
    const { instance } = limiter(3);
    for (let i = 0; i < 50; i++) instance.hit(`key-${i}`);
    expect(instance.size).toBeLessThanOrEqual(5);
  });

  it('consume() checks and counts in one step', () => {
    const { instance } = limiter(3);
    expect([1, 2, 3, 4, 5].map(() => instance.consume('k').allowed)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    // A refused attempt is not recorded, so the wait does not grow while blocked.
    const blocked = instance.check('k');
    if (!blocked.allowed) expect(blocked.retryAfterMs).toBe(60_000);
  });
});

describe('clientIp', () => {
  const headers = new Headers({
    'x-forwarded-for': '203.0.113.7, 10.0.0.1',
    'x-real-ip': '198.51.100.2',
  });

  it('ignores client-supplied proxy headers unless a trusted proxy wrote them', () => {
    // `next start` keeps an X-Forwarded-For the client sent, so it proves nothing.
    expect(clientIp(headers, {})).toBe(UNTRUSTED_CLIENT);
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.9' }), {})).toBe(UNTRUSTED_CLIENT);
    expect(clientIp(undefined, {})).toBe(UNTRUSTED_CLIENT);
  });

  it('on Vercel uses the first entry, which the platform overwrites', () => {
    expect(clientIp(headers, { VERCEL: '1' })).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }), { VERCEL: '1' })).toBe(
      '198.51.100.2',
    );
    expect(clientIp(new Headers(), { VERCEL: '1' })).toBe(UNTRUSTED_CLIENT);
  });

  it('with TRUST_PROXY=true uses the entry the proxy appended (the last one)', () => {
    expect(clientIp(headers, { TRUST_PROXY: 'true' })).toBe('10.0.0.1');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }), { TRUST_PROXY: 'true' })).toBe(
      '198.51.100.2',
    );
  });
});
