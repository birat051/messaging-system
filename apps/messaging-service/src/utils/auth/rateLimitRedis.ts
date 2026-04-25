import { createHash } from 'node:crypto';
import { getRedisClient } from '../../data/redis/redis.js';

/**
 * Fixed-window counter: first request sets TTL. Returns current count after increment.
 * Global REST cap uses the same primitive — see `apps/messaging-service/.env.example` (global rate limits).
 */
export async function fixedWindowIncrement(
  key: string,
  windowSeconds: number,
): Promise<number> {
  const redis = getRedisClient();
  const n = await redis.incr(key);
  if (n === 1) {
    await redis.expire(key, windowSeconds);
  }
  return n;
}

export async function rateLimitExceeded(
  key: string,
  windowSeconds: number,
  max: number,
): Promise<boolean> {
  const n = await fixedWindowIncrement(key, windowSeconds);
  return n > max;
}

export function emailRateLimitKey(email: string): string {
  const normalized = email.trim().toLowerCase();
  const hash = createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 32);
  return `ratelimit:email:${hash}`;
}
