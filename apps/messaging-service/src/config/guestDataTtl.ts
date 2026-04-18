import type { Env } from './env.js';
import type { EffectiveRuntimeConfig } from './runtimeConfig.js';

/**
 * Absolute UTC expiry for MongoDB TTL (**`expireAfterSeconds: 0`**) on **`guestDataExpiresAt`** fields.
 * Returns **`undefined`** when TTL is disabled — callers omit the field (no TTL cleanup).
 */
export function computeGuestDataExpiresAt(
  env: Env,
  effective: EffectiveRuntimeConfig,
): Date | undefined {
  if (!effective.guestDataTtlEnabled) {
    return undefined;
  }
  return new Date(Date.now() + env.GUEST_DATA_MONGODB_TTL_SECONDS * 1000);
}
