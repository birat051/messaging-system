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

/**
 * Idempotent backfill: older **`users`** documents may omit **`profilePicture`** / **`status`**.
 * Sets explicit **`null`** so stored shape matches **`User`** / **`UserPublic`** (OpenAPI).
 */
export async function ensureUserProfileFieldsBackfill(db: Db): Promise<void> {
  const col = db.collection(USERS_COLLECTION);
  const pic = await col.updateMany(
    { profilePicture: { $exists: false } },
    { $set: { profilePicture: null } },
  );
  const st = await col.updateMany(
    { status: { $exists: false } },
    { $set: { status: null } },
  );
  const modified = (pic.modifiedCount ?? 0) + (st.modifiedCount ?? 0);
  if (modified > 0) {
    logger.info(
      {
        profilePictureBackfilled: pic.modifiedCount,
        statusBackfilled: st.modifiedCount,
      },
      'MongoDB users profilePicture/status backfill',
    );
  }
}
