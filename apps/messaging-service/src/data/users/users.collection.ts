import type { Db, ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';

/** MongoDB collection name (OpenAPI `User`; excludes password from API). */
export const USERS_COLLECTION = 'users';

/**
 * Persisted user document — **never** return `passwordHash` on REST/WebSocket.
 * `id` is the stable string id exposed as **`User.id`** in OpenAPI.
 */
export type UserDocument = {
  _id?: ObjectId;
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  profilePicture: string | null;
  status: string | null;
  emailVerified: boolean;
  /** Increment to invalidate all refresh tokens (e.g. password change). */
  refreshTokenVersion?: number;
  /** Durable last-seen (also hot path in Redis while online). */
  lastSeenAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Idempotent indexes for **`users`**: unique **`email`**, unique **`id`** (API id).
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
