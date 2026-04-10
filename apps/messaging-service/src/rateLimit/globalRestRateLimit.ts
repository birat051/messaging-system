import { rateLimitExceeded } from '../auth/rateLimitRedis.js';
import type { Env } from '../config/env.js';

/**
 * Redis key for the global REST per-IP counter (**`fixedWindowIncrement`** in **`auth/rateLimitRedis.ts`**).
 */
export function globalRestRateLimitKey(clientIp: string): string {
  return `ratelimit:global:ip:${clientIp}`;
}

/**
 * Returns **`true`** when this IP has exceeded **`GLOBAL_RATE_LIMIT_MAX`** inside the current window
 * (**`GLOBAL_RATE_LIMIT_WINDOW_SEC`**). Used by **`createGlobalRestRateLimitMiddleware`**.
 */
export async function isGlobalRestRateLimitExceeded(
  env: Env,
  clientIp: string,
): Promise<boolean> {
  return rateLimitExceeded(
    globalRestRateLimitKey(clientIp),
    env.GLOBAL_RATE_LIMIT_WINDOW_SEC,
    env.GLOBAL_RATE_LIMIT_MAX,
  );
}
