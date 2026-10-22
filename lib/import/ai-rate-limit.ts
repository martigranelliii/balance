import {
  AI_RATE_LIMIT_MAX,
  AI_RATE_LIMIT_WINDOW_MS,
} from "./ai";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Per-user in-memory guard. Serverless instances do not share memory, so the
 * upstream Gemini quota and per-request movement cap remain the hard limits.
 */
export function consumeAiRateLimit(
  userId: string,
  now = Date.now(),
): RateLimitResult {
  const current = buckets.get(userId);
  const bucket =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + AI_RATE_LIMIT_WINDOW_MS };

  if (bucket.count >= AI_RATE_LIMIT_MAX) {
    buckets.set(userId, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  buckets.set(userId, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, AI_RATE_LIMIT_MAX - bucket.count),
    retryAfterSeconds: 0,
  };
}

export function resetAiRateLimits(): void {
  buckets.clear();
}
