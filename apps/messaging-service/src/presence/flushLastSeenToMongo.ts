import { getDb } from '../db/mongo.js';
import { logger } from '../logger.js';
import { USERS_COLLECTION } from '../users/constants.js';
import { deleteLastSeenRedis, getLastSeen } from './lastSeen.js';

/**
 * On Socket.IO disconnect: copy last heartbeat time from Redis to MongoDB, then remove the Redis key.
 * `lastSeenAt` uses the Redis value (last successful heartbeat); if missing, uses current time.
 */
export async function flushLastSeenToMongo(userId: string): Promise<void> {
  const at = (await getLastSeen(userId)) ?? new Date();
  const db = getDb();
  const result = await db
    .collection(USERS_COLLECTION)
    .updateOne({ id: userId }, { $set: { lastSeenAt: at } });
  if (result.matchedCount === 0) {
    logger.warn(
      { userId },
      'flushLastSeenToMongo: no user document matched (user may not exist yet)',
    );
  }
  await deleteLastSeenRedis(userId);
}
