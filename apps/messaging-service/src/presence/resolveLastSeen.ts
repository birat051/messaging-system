import { getDb } from '../db/mongo.js';
import { USERS_COLLECTION } from '../users/constants.js';
import { getLastSeen } from './lastSeen.js';

/** Response for `presence:getLastSeen` Socket.IO ack (Feature 6). */
export type LastSeenSocketResult =
  | {
      status: 'ok';
      source: 'redis' | 'mongodb';
      lastSeenAt: string;
    }
  | { status: 'not_available' }
  | {
      status: 'error';
      code: 'invalid_payload' | 'internal_error';
      message: string;
    };

/**
 * Resolve last-seen for a user: **Redis first** (hot online presence), else **MongoDB**
 * `users.lastSeenAt`. If neither has a value, **`not_available`**.
 */
export async function resolveLastSeenForUser(
  userId: string,
): Promise<LastSeenSocketResult> {
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    return {
      status: 'error',
      code: 'invalid_payload',
      message: 'targetUserId is required',
    };
  }

  const fromRedis = await getLastSeen(trimmed);
  if (fromRedis) {
    return {
      status: 'ok',
      source: 'redis',
      lastSeenAt: fromRedis.toISOString(),
    };
  }

  const doc = await getDb()
    .collection(USERS_COLLECTION)
    .findOne({ id: trimmed }, { projection: { lastSeenAt: 1 } });

  const raw = doc?.lastSeenAt;
  if (raw !== undefined && raw !== null) {
    const d = raw instanceof Date ? raw : new Date(raw as string | number);
    if (!Number.isNaN(d.getTime())) {
      return {
        status: 'ok',
        source: 'mongodb',
        lastSeenAt: d.toISOString(),
      };
    }
  }

  return { status: 'not_available' };
}
