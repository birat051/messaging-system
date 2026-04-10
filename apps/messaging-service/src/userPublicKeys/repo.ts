import { getDb } from '../db/mongo.js';
import { AppError } from '../errors/AppError.js';
import { USER_PUBLIC_KEYS_COLLECTION } from './constants.js';
import type { UserPublicKeyDocument } from './types.js';

export type UserPublicKeyApiShape = {
  userId: string;
  publicKey: string;
  keyVersion: number;
  updatedAt: string;
};

export function toUserPublicKeyResponse(
  doc: UserPublicKeyDocument,
): UserPublicKeyApiShape {
  return {
    userId: doc.userId,
    publicKey: doc.publicKey,
    keyVersion: doc.keyVersion ?? 1,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function findPublicKeyByUserId(
  userId: string,
): Promise<UserPublicKeyDocument | null> {
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const col = getDb().collection<UserPublicKeyDocument>(
    USER_PUBLIC_KEYS_COLLECTION,
  );
  return col.findOne({ userId: trimmed });
}

/**
 * **`PUT /users/me/public-key`** — insert or replace; **`keyVersion`** optional on first write only
 * in practice (updates preserve version unless the client sends a new **`keyVersion`**).
 */
export async function upsertPublicKeyPut(
  userId: string,
  publicKey: string,
  optionalKeyVersion?: number,
): Promise<UserPublicKeyDocument> {
  const col = getDb().collection<UserPublicKeyDocument>(
    USER_PUBLIC_KEYS_COLLECTION,
  );
  const now = new Date();
  const existing = await findPublicKeyByUserId(userId);

  if (!existing) {
    const kv = optionalKeyVersion ?? 1;
    if (kv < 1) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'keyVersion must be at least 1',
      );
    }
    const doc: UserPublicKeyDocument = {
      userId,
      publicKey,
      keyVersion: kv,
      updatedAt: now,
    };
    await col.insertOne(doc);
    return doc;
  }

  const nextVersion =
    optionalKeyVersion !== undefined
      ? optionalKeyVersion
      : (existing.keyVersion ?? 1);
  if (nextVersion < 1) {
    throw new AppError('INVALID_REQUEST', 400, 'keyVersion must be at least 1');
  }

  await col.updateOne(
    { userId },
    { $set: { publicKey, keyVersion: nextVersion, updatedAt: now } },
  );
  const updated = await findPublicKeyByUserId(userId);
  if (!updated) {
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to read updated key');
  }
  return updated;
}

/**
 * **`POST /users/me/public-key/rotate`** — bumps **`keyVersion`**; fails when no row exists.
 */
export async function rotatePublicKey(
  userId: string,
  publicKey: string,
): Promise<UserPublicKeyDocument> {
  const existing = await findPublicKeyByUserId(userId);
  if (!existing) {
    throw new AppError(
      'NOT_FOUND',
      404,
      'No public key registered',
    );
  }
  if (existing.publicKey === publicKey) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'New public key must differ from the current key',
    );
  }
  const col = getDb().collection<UserPublicKeyDocument>(
    USER_PUBLIC_KEYS_COLLECTION,
  );
  const nextVersion = (existing.keyVersion ?? 1) + 1;
  const now = new Date();
  await col.updateOne(
    { userId },
    { $set: { publicKey, keyVersion: nextVersion, updatedAt: now } },
  );
  const updated = await findPublicKeyByUserId(userId);
  if (!updated) {
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to read rotated key');
  }
  return updated;
}
