import { describe, expect, it } from 'vitest';
import { clientIp, SlidingWindowRateLimiter } from '@/lib/rate-limit';

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
});

describe('clientIp', () => {
  it('uses the first x-forwarded-for entry, then x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
    expect(clientIp(undefined)).toBe('unknown');
  });
});
