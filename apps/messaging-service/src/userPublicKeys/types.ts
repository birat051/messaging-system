import type { ObjectId } from 'mongodb';

/**
 * One document per **`userId`** (same id as **`User.id`**) — **no** device id dimension.
 * **No `privateKey` field** (or any private material) exists in this type or in REST/Zod/OpenAPI — only **`publicKey`**.
 * **`publicKey`** encoding is fixed at the API layer (OpenAPI).
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
