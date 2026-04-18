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
  /**
   * Registered users: normalized email. **Guests** omit this field (no synthetic email) so sparse unique
   * **`users_email_unique`** applies only to registered accounts.
   */
  email?: string;
  /** Normalized **`[a-z0-9_]{3,30}`** — unique when present; omitted on legacy rows. */
  username?: string;
  passwordHash: string;
  displayName: string | null;
  profilePicture: string | null;
  status: string | null;
  emailVerified: boolean;
  /** When true, token issuance uses guest TTLs (**`GUEST_*_TOKEN_TTL_SECONDS`**). */
  isGuest?: boolean;
  /**
   * When **`system_config` / env** enable guest data TTL, set to a future **`Date`** for MongoDB TTL index
   * (**`expireAfterSeconds: 0`**) on **`guestDataExpiresAt`**.
   */
  guestDataExpiresAt?: Date;
  /** Increment to invalidate all refresh tokens (e.g. password change). */
  refreshTokenVersion?: number;
  /** Durable last-seen (also hot path in Redis while online). */
  lastSeenAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Idempotent indexes for **`users`**: unique sparse **`email`** (registered only — guests omit **`email`**),
 * unique **`id`**, unique sparse **`username`**, optional TTL on **`guestDataExpiresAt`** (guest rows only).
 * Replaces legacy non-sparse **`users_email_unique`** when present.
 */
export async function ensureUserIndexes(db: Db): Promise<void> {
  const col = db.collection(USERS_COLLECTION);
  await col.dropIndex('users_email_unique').catch(() => {
    /* missing on fresh DB */
  });
  await col.createIndex(
    { email: 1 },
    { unique: true, sparse: true, name: 'users_email_unique' },
  );
  await col.createIndex({ id: 1 }, { unique: true, name: 'users_id_unique' });
  await col.createIndex(
    { username: 1 },
    { unique: true, sparse: true, name: 'users_username_unique' },
  );
  await col.createIndex(
    { guestDataExpiresAt: 1 },
    {
      name: 'users_guest_data_ttl',
      expireAfterSeconds: 0,
      sparse: true,
    },
  );
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
