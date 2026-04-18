import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { Env } from '../../config/env.js';
import { rateLimitExceeded } from './rateLimitRedis.js';

/** Optional client-stable id (e.g. device / install) — separate Redis bucket from IP. */
export const CLIENT_FINGERPRINT_HEADER = 'x-client-fingerprint';

const FINGERPRINT_RAW_MAX = 512;

/**
 * Best-effort optional fingerprint string from **`X-Client-Fingerprint`** (trimmed, length-capped).
 */
export function getClientFingerprintHeader(req: Request): string | undefined {
  const raw = req.headers[CLIENT_FINGERPRINT_HEADER];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const t = raw.trim();
  if (t.length === 0) {
    return undefined;
  }
  return t.length > FINGERPRINT_RAW_MAX ? t.slice(0, FINGERPRINT_RAW_MAX) : t;
}

function fingerprintRedisKeySegment(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 32);
}

/**
 * Fixed-window caps for **`POST /auth/guest`**: always **per client IP**; when a fingerprint is sent,
 * also **per fingerprint** (both must stay under their respective maxima).
 */
export async function isGuestAuthRateLimited(
  env: Env,
  opts: { ip: string; fingerprintRaw?: string },
): Promise<boolean> {
  const w = env.GUEST_AUTH_RATE_LIMIT_WINDOW_SEC;
  if (
    await rateLimitExceeded(
      `ratelimit:auth-guest:ip:${opts.ip}`,
      w,
      env.GUEST_AUTH_RATE_LIMIT_MAX_PER_IP,
    )
  ) {
    return true;
  }
  if (opts.fingerprintRaw !== undefined) {
    const seg = fingerprintRedisKeySegment(opts.fingerprintRaw);
    if (
      await rateLimitExceeded(
        `ratelimit:auth-guest:fp:${seg}`,
        w,
        env.GUEST_AUTH_RATE_LIMIT_MAX_PER_FINGERPRINT,
      )
    ) {
      return true;
    }
  }
  return false;
}
