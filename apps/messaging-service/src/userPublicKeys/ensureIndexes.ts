import type { Db } from 'mongodb';
import { logger } from '../logger.js';
import { USER_PUBLIC_KEYS_COLLECTION } from './constants.js';

/**
 * **User-level** public keys only — unique **`userId`** (no device-level compound keys).
 */
export async function ensureUserPublicKeyIndexes(db: Db): Promise<void> {
  const col = db.collection(USER_PUBLIC_KEYS_COLLECTION);
  await col.createIndex(
    { userId: 1 },
    { unique: true, name: 'user_public_keys_userId_unique' },
  );
  logger.info('MongoDB user_public_keys indexes ensured');
}
