import type { Db } from 'mongodb';
import { logger } from '../logger.js';
import { USERS_COLLECTION } from './constants.js';

/**
 * Idempotent indexes for **`users`**: unique **`email`**, unique **`id`** (API id).
 * Call after MongoDB is connected (startup).
 */
export async function ensureUserIndexes(db: Db): Promise<void> {
  const col = db.collection(USERS_COLLECTION);
  await col.createIndex(
    { email: 1 },
    { unique: true, name: 'users_email_unique' },
  );
  await col.createIndex({ id: 1 }, { unique: true, name: 'users_id_unique' });
  logger.info('MongoDB users indexes ensured');
}
