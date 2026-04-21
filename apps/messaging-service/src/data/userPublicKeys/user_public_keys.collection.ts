import type { Db, ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';

/**
 * **Per-device** public key directory (E2EE). Compound logical key **`(userId, deviceId)`**.
 * **No `privateKey`** (or any private material) in this type or in REST/Zod/OpenAPI — only **`publicKey`**.
 *
 * @see **`docs/PROJECT_PLAN.md` §7.1**, **`docs/TASK_CHECKLIST.md`** Prerequisite — User keypair
 */
export const USER_DEVICE_PUBLIC_KEYS_COLLECTION = 'user_device_public_keys';

/** @deprecated Legacy user-level-only collection — migrated into {@link USER_DEVICE_PUBLIC_KEYS_COLLECTION} at startup. */
export const LEGACY_USER_PUBLIC_KEYS_COLLECTION = 'user_public_keys';

/**
 * Until **`POST /v1/users/me/devices`** ships, **`PUT` / `GET` / `rotate`** user-level routes use this
 * synthetic **`deviceId`** so one registered key per user maps to the new schema.
 */
export const DEFAULT_SINGLE_DEVICE_ID = 'default';

/**
 * One document per **`(userId, deviceId)`** — **`userId`** matches **`User.id`**; **`deviceId`** is opaque (e.g. UUID from device registration API).
 */
export type UserPublicKeyDocument = {
  _id?: ObjectId;
  userId: string;
  deviceId: string;
  /** SPKI Base64 (P-256), same wire rules as OpenAPI. */
  publicKey: string;
  /** Optional UX label from the client (e.g. browser / device name). */
  deviceLabel?: string | null;
  /**
   * Last activity touch for this device row (e.g. **`POST /users/me/devices`**). Omitted on older rows —
   * **`GET /users/me/devices`** falls back to **`updatedAt`** in the wire shape.
   */
  lastSeenAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Register/rotate counter for directory **`keyVersion`** — not part of the identity key.
   */
  keyVersion?: number;
};

export async function ensureUserPublicKeyIndexes(db: Db): Promise<void> {
  const col = db.collection(USER_DEVICE_PUBLIC_KEYS_COLLECTION);
  await col.createIndex(
    { userId: 1, deviceId: 1 },
    {
      unique: true,
      name: 'user_device_public_keys_userId_deviceId_unique',
    },
  );
  await col.createIndex(
    { userId: 1 },
    { name: 'user_device_public_keys_userId' },
  );
  logger.info('MongoDB user_device_public_keys indexes ensured');

  await migrateLegacyUserPublicKeysIfNeeded(db);
}

/**
 * Copy rows from legacy **`user_public_keys`** (one doc per user) into **`user_device_public_keys`**
 * as **`(userId, {@link DEFAULT_SINGLE_DEVICE_ID})`** when missing — idempotent.
 */
async function migrateLegacyUserPublicKeysIfNeeded(db: Db): Promise<void> {
  const legacy = db.collection(LEGACY_USER_PUBLIC_KEYS_COLLECTION);
  const target = db.collection<UserPublicKeyDocument>(
    USER_DEVICE_PUBLIC_KEYS_COLLECTION,
  );

  let migrated = 0;
  const cursor = legacy.find({});
  for await (const raw of cursor) {
    const doc = raw as {
      userId?: string;
      publicKey?: string;
      updatedAt?: Date;
      keyVersion?: number;
    };
    const userId = doc.userId?.trim();
    if (!userId || !doc.publicKey) {
      continue;
    }
    const exists = await target.findOne({
      userId,
      deviceId: DEFAULT_SINGLE_DEVICE_ID,
    });
    if (exists) {
      continue;
    }
    const updatedAt = doc.updatedAt ?? new Date();
    await target.insertOne({
      userId,
      deviceId: DEFAULT_SINGLE_DEVICE_ID,
      publicKey: doc.publicKey,
      createdAt: updatedAt,
      updatedAt,
      keyVersion: doc.keyVersion ?? 1,
    });
    migrated += 1;
  }
  if (migrated > 0) {
    logger.info(
      { migrated },
      'Migrated legacy user_public_keys rows into user_device_public_keys',
    );
  }
}
