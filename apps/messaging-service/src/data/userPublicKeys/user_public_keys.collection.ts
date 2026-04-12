import type { Db, ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';

/** MongoDB collection name — user-level public key directory (E2EE); no per-device rows. */
export const USER_PUBLIC_KEYS_COLLECTION = 'user_public_keys';

/**
 * One document per **`userId`** (same id as **`User.id`**) — **no** device id dimension.
 * **No `privateKey` field** (or any private material) exists in this type or in REST/Zod/OpenAPI — only **`publicKey`**.
 *
 * @see `docs/USER_KEYPAIR_AND_E2EE_DESIGN.md`
 */
export type UserPublicKeyDocument = {
  _id?: ObjectId;
  /** Stable user id — unique in this collection. */
  userId: string;
  /** Public key material (e.g. SPKI Base64 or canonical raw bytes as agreed in OpenAPI). */
  publicKey: string;
  /** Present when the client registers or rotates; omit only on legacy / pre-migration docs. */
  keyVersion?: number;
  updatedAt: Date;
};

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
