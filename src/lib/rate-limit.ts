/**
 * In-memory sliding-window rate limiter.
 *
 * Each key keeps the timestamps of its recent hits; a request is refused while
 * `limit` hits fall inside the last `windowMs`. Unlike a fixed window there is no
 * boundary to game: five failures at 11:59 still count at 12:01.
 *
 * LIMITATION (documented in DECISIONS.md): state lives in the memory of one server
 * process. On Vercel every serverless instance has its own copy and instances are
 * recycled, so the effective limit is "per instance" - it slows down a naive
 * brute-force loop but is not a hard guarantee. A shared store (Upstash Redis,
 * Vercel KV, a database table) is the upgrade path and only needs this class's
 * three methods re-implemented.
 */
export type RateLimitCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly options: {
      limit: number;
      windowMs: number;
      /** Injectable clock for tests. */
      now?: () => number;
      /** Upper bound on tracked keys, so a flood of unique keys cannot exhaust memory. */
      maxKeys?: number;
    },
  ) {}

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private recent(key: string, now: number): number[] {
    const cutoff = now - this.options.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((time) => time > cutoff);
    if (kept.length) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  /** Would another attempt be allowed right now? Does not record anything. */
  check(key: string): RateLimitCheck {
    const now = this.now();
    const recent = this.recent(key, now);
    if (recent.length < this.options.limit) return { allowed: true };
    const oldest = recent[recent.length - this.options.limit];
    return { allowed: false, retryAfterMs: Math.max(0, oldest + this.options.windowMs - now) };
  }

  /** Records one attempt (for login: one failed attempt). */
  hit(key: string): void {
    const now = this.now();
    const recent = this.recent(key, now);
    recent.push(now);
    this.hits.set(key, recent);
    this.evictIfNeeded(now);
  }

  /** Clears a key, e.g. after a successful login. */
  reset(key: string): void {
    this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }

  private evictIfNeeded(now: number): void {
    const maxKeys = this.options.maxKeys ?? 10_000;
    if (this.hits.size <= maxKeys) return;
    for (const key of [...this.hits.keys()]) this.recent(key, now);
    // Still too many live keys: drop the oldest-inserted ones (Map keeps insertion order).
    for (const key of this.hits.keys()) {
      if (this.hits.size <= maxKeys) break;
      this.hits.delete(key);
    }
  }
}

/** Failed sign-ins: 5 per 15 minutes for each IP + email pair. */
export const loginRateLimiter = new SlidingWindowRateLimiter({ limit: 5, windowMs: 15 * 60_000 });

/** Account creation: 5 per hour for each IP. */
export const registerRateLimiter = new SlidingWindowRateLimiter({
  limit: 5,
  windowMs: 60 * 60_000,
});

/**
 * Best-effort client IP from proxy headers. Vercel sets x-forwarded-for with the
 * real client first; locally it is usually absent or a loopback address.
 */
export function clientIp(headers: Headers | null | undefined): string {
  const forwarded = headers?.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers?.get('x-real-ip')?.trim() || 'unknown';
}
