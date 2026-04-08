import { loadEnv } from '../config/env.js';
import { getRedisClient } from '../redis/redis.js';

const KEY_PREFIX = 'presence:lastSeen:';

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/**
 * Hot last-seen while online: Unix ms in Redis with TTL (TASK_CHECKLIST Feature 6).
 * Updated only from **`presence:heartbeat`** (~every 5s from client), not on socket connect.
 */
export async function setLastSeen(userId: string): Promise<void> {
  const env = loadEnv();
  const client = getRedisClient();
  await client.set(key(userId), String(Date.now()), {
    EX: env.LAST_SEEN_TTL_SECONDS,
  });
}

/**
 * Returns last activity time for a user, or `null` if unknown / expired.
 */
export async function getLastSeen(userId: string): Promise<Date | null> {
  const raw = await getRedisClient().get(key(userId));
  if (raw === null) {
    return null;
  }
  const ms = Number.parseInt(raw, 10);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return new Date(ms);
}

/** Clears hot presence after flush to MongoDB on disconnect. */
export async function deleteLastSeenRedis(userId: string): Promise<void> {
  await getRedisClient().del(key(userId));
}
