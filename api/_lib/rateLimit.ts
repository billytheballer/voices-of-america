/**
 * Token-bucket rate limiter keyed by client (IP). In-memory: each serverless
 * instance keeps its own buckets, which is enough to stop casual abuse of a
 * portfolio demo. For hard guarantees, back this with a shared store
 * (e.g. Redis/Upstash) behind the same interface.
 */
export interface RateLimiter {
  /** Returns true if the request may proceed (and consumes a token). */
  take(key: string): boolean;
}

export function createRateLimiter({
  capacity,
  refillPerMinute,
  now = () => Date.now(),
  maxKeys = 10_000,
}: {
  capacity: number;
  refillPerMinute: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    take(key) {
      const t = now();
      const b = buckets.get(key) ?? { tokens: capacity, at: t };
      b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 60_000) * refillPerMinute);
      b.at = t;
      if (buckets.size > maxKeys) buckets.clear(); // crude memory guard
      buckets.set(key, b);
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    },
  };
}
