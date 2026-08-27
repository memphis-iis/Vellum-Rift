/**
 * Tiny in-memory rate limiter for public kiosk token mint (#145).
 * Not distributed — fine for a single backend replica; document for multi-host.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
};

/**
 * Allow up to `limit` hits per `windowMs` for `key`.
 * Default: 30 mints / 5 minutes per IP+session (museum QR bursts).
 */
export function checkRateLimit(
  key: string,
  limit = Number(process.env.KIOSK_RATE_LIMIT ?? 30),
  windowMs = Number(process.env.KIOSK_RATE_WINDOW_MS ?? 5 * 60_000),
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

/** Test helper — clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
