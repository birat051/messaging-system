import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { getRedisClient } from '../../data/redis/redis.js';

const PREFIX = 'rt:';

function tokenHash(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export type StoredRefreshPayload = {
  userId: string;
  v: number;
};

/**
 * Opaque refresh token stored in Redis with TTL; payload ties to **`refreshTokenVersion`** on the user.
 */
export async function createRefreshToken(
  env: Env,
  userId: string,
  refreshTokenVersion: number,
): Promise<string> {
  const redis = getRedisClient();
  const raw = randomBytes(48).toString('base64url');
  const h = tokenHash(raw);
  const payload: StoredRefreshPayload = {
    userId,
    v: refreshTokenVersion,
  };
  await redis.set(`${PREFIX}${h}`, JSON.stringify(payload), {
    EX: env.REFRESH_TOKEN_TTL_SECONDS,
  });
  return raw;
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${PREFIX}${tokenHash(raw)}`);
}

export async function getRefreshPayload(
  raw: string,
): Promise<StoredRefreshPayload | null> {
  const redis = getRedisClient();
  const val = await redis.get(`${PREFIX}${tokenHash(raw)}`);
  if (!val) {
    return null;
  }
  try {
    return JSON.parse(val) as StoredRefreshPayload;
  } catch {
    return null;
  }
}
