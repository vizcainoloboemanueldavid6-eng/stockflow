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

  /**
   * Checks and records one attempt in a single synchronous step, and returns the check.
   * Call it BEFORE any await. A check() ... await ... hit() sequence lets a burst of
   * simultaneous requests all pass check() before the first hit() lands, so the limit
   * would only bound attempts per round trip instead of per window.
   */
  consume(key: string): RateLimitCheck {
    const result = this.check(key);
    if (result.allowed) this.hit(key);
    return result;
  }

  /** Records one attempt without checking. */
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

/** Key shared by every request when no trusted proxy tells us the client's address. */
export const UNTRUSTED_CLIENT = 'direct';

/**
 * The client address used as a rate-limit key.
 *
 * X-Forwarded-For is only as trustworthy as the proxy that wrote it. `next start`
 * fills it in only when the request does not already carry one, so a client talking
 * to a self-hosted server directly can put any value there - a fresh rate-limit
 * bucket for every request. The header is therefore trusted only:
 *   - on Vercel (VERCEL=1), whose edge network overwrites it with the real client
 *     address: the first entry;
 *   - with TRUST_PROXY=true, for a self-hosted server behind a reverse proxy that
 *     appends the address it saw (nginx `proxy_add_x_forwarded_for`, Caddy, Traefik):
 *     the last entry, the only one the proxy vouches for.
 * Otherwise every request shares one key, so the login limit applies per email and
 * the registration limit per server - stricter, but impossible to dodge.
 */
export function clientIp(
  headers: Headers | null | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  const forwarded = (headers?.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const realIp = headers?.get('x-real-ip')?.trim();
  if (env.VERCEL === '1') return forwarded[0] || realIp || UNTRUSTED_CLIENT;
  if (env.TRUST_PROXY?.trim().toLowerCase() === 'true') {
    return forwarded.at(-1) || realIp || UNTRUSTED_CLIENT;
  }
  return UNTRUSTED_CLIENT;
}
