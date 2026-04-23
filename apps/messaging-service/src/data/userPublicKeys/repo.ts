import { randomUUID } from 'node:crypto';
import { getDb } from '../../data/db/mongo.js';
import { AppError } from '../../utils/errors/AppError.js';
import {
  USER_DEVICE_PUBLIC_KEYS_COLLECTION,
  type UserPublicKeyDocument,
} from './user_public_keys.collection.js';

/**
 * All registered devices for **`userId`** (ordered by **`updatedAt`** desc for stable “primary” if needed later).
 */
export async function findUserDeviceRow(
  userId: string,
  deviceId: string,
): Promise<UserPublicKeyDocument | null> {
  const col = getDb().collection<UserPublicKeyDocument>(
    USER_DEVICE_PUBLIC_KEYS_COLLECTION,
  );
  return col.findOne({
    userId: userId.trim(),
    deviceId: deviceId.trim(),
  });
}

/**
 * When **`raw`** is set, ensures **`(userId, deviceId)`** exists — otherwise throws **`INVALID_REQUEST`**.
 * Used when embedding **`sourceDeviceId`** in access JWTs at login / refresh.
 */
export async function resolveSourceDeviceIdForAccessToken(
  userId: string,
  raw?: string | null,
): Promise<string | undefined> {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    return undefined;
  }
  const row = await findUserDeviceRow(userId, trimmed);
  if (!row) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      'sourceDeviceId is not a registered device for this user',
    );
  }
  return trimmed;
}

/**
 * Full device directory for **`userId`** — **`GET /users/:userId/devices/public-keys`** uses this with **no** pagination
 * or row cap (every **`user_device_public_keys`** document for that user).
 */
export async function findDevicePublicKeysByUserId(
  userId: string,
): Promise<UserPublicKeyDocument[]> {
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const col = getDb().collection<UserPublicKeyDocument>(
    USER_DEVICE_PUBLIC_KEYS_COLLECTION,
  );
  return col
    .find({ userId: trimmed })
    .sort({ updatedAt: -1 })
    .toArray();
}

/** `POST /users/me/devices` — **200** JSON (**`RegisterDeviceResponse`**). */
export type RegisterDeviceResponseApi = {
  deviceId: string;
  publicKey: string;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
};

export function toRegisterDeviceResponse(
  doc: UserPublicKeyDocument,
): RegisterDeviceResponseApi {
  return {
    deviceId: doc.deviceId,
    publicKey: doc.publicKey,
    keyVersion: doc.keyVersion ?? 1,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** **`POST /users/me/devices`** with **`bootstrap: true`** — **201** body. */
export type RegisterDeviceBootstrapResponseApi = {
  deviceId: string;
};

export function toRegisterDeviceBootstrapResponse(
  doc: UserPublicKeyDocument,
): RegisterDeviceBootstrapResponseApi {
  return { deviceId: doc.deviceId };
}

export type DevicePublicKeysListResponseApi = {
  items: Array<{
    deviceId: string;
    publicKey: string;
    keyVersion: number;
    deviceLabel?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

/** **`GET /users/me/devices`** — includes **`publicKey`** (SPKI) so clients can verify **`device:sync_requested`** payloads. */
export type MyDevicesListResponseApi = {
  items: Array<{
    deviceId: string;
    deviceLabel: string | null;
    createdAt: string;
    lastSeenAt: string;
    publicKey: string;
  }>;
};

function lastSeenAtForWire(doc: UserPublicKeyDocument): Date {
  return doc.lastSeenAt ?? doc.updatedAt;
}

export function toMyDevicesListResponse(
  docs: UserPublicKeyDocument[],
): MyDevicesListResponseApi {
  return {
    items: docs.map((d) => ({
      deviceId: d.deviceId,
      deviceLabel: d.deviceLabel ?? null,
      createdAt: d.createdAt.toISOString(),
      lastSeenAt: lastSeenAtForWire(d).toISOString(),
      publicKey: d.publicKey,
    })),
  };
}

export function toDevicePublicKeysListResponse(
  docs: UserPublicKeyDocument[],
): DevicePublicKeysListResponseApi {
  return {
    items: docs.map((d) => ({
      deviceId: d.deviceId,
      publicKey: d.publicKey,
      keyVersion: d.keyVersion ?? 1,
      ...(d.deviceLabel != null && d.deviceLabel !== ''
        ? { deviceLabel: d.deviceLabel }
        : {}),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  };
}

export type RegisterDeviceOutcome = {
  document: UserPublicKeyDocument;
  /** True only when a new **`(userId, deviceId)`** document was inserted (not an update / idempotent touch). */
  isNewDeviceRow: boolean;
};

/**
 * **`POST /users/me/devices`** — register or update a device row. Server assigns **`deviceId`** when omitted.
 */
export async function registerOrUpdateDevice(
  userId: string,
  publicKey: string,
  clientDeviceId?: string,
  deviceLabel?: string,
): Promise<RegisterDeviceOutcome> {
  const col = getDb().collection<UserPublicKeyDocument>(
    USER_DEVICE_PUBLIC_KEYS_COLLECTION,
  );
  const now = new Date();
  const trimmed =
    clientDeviceId !== undefined ? clientDeviceId.trim() : undefined;
  const deviceId =
    trimmed !== undefined && trimmed.length > 0 ? trimmed : randomUUID();
  if (deviceId.length > 128) {
    throw new AppError('INVALID_REQUEST', 400, 'deviceId is too long');
  }

  const labelTrimmed =
    deviceLabel !== undefined ? deviceLabel.trim() : undefined;
  const labelToStore =
    labelTrimmed !== undefined && labelTrimmed.length > 0
      ? labelTrimmed
      : undefined;

  const filter = { userId, deviceId };
  const existing = await col.findOne(filter);

  if (!existing) {
    const doc: UserPublicKeyDocument = {
      userId,
      deviceId,
      publicKey,
      keyVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      ...(labelToStore !== undefined ? { deviceLabel: labelToStore } : {}),
    };
    await col.insertOne(doc);
    return { document: doc, isNewDeviceRow: true };
  }

  if (existing.publicKey === publicKey) {
    if (labelTrimmed !== undefined) {
      const nextLabel = labelToStore ?? null;
      const prevLabel = existing.deviceLabel ?? null;
      if (nextLabel !== prevLabel) {
        await col.updateOne(filter, {
          $set: {
            deviceLabel: nextLabel,
            updatedAt: now,
            lastSeenAt: now,
          },
        });
        const relabeled = await col.findOne(filter);
        if (relabeled) {
          return { document: relabeled, isNewDeviceRow: false };
        }
      }
    }
    await col.updateOne(filter, { $set: { lastSeenAt: now } });
    const refreshed = await col.findOne(filter);
    return {
      document: refreshed ?? existing,
      isNewDeviceRow: false,
    };
  }

  await col.updateOne(filter, {
    $set: {
      publicKey,
      updatedAt: now,
      lastSeenAt: now,
      keyVersion: (existing.keyVersion ?? 1) + 1,
      ...(labelTrimmed !== undefined ? { deviceLabel: labelToStore ?? null } : {}),
    },
  });
  const updated = await col.findOne(filter);
  if (!updated) {
    throw new AppError(
      'INTERNAL_ERROR',
      500,
      'Failed to read updated device key',
    );
  }
  return { document: updated, isNewDeviceRow: false };
}

/**
 * **`DELETE /users/me/devices/:deviceId`** — removes **`(userId, deviceId)`** from **`user_device_public_keys`** only.
 * Does **not** mutate **`messages`** to remove **`encryptedMessageKeys[deviceId]`** (see OpenAPI **`deleteMyDevice`**).
 */
export async function deleteDeviceForUser(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const col = getDb().collection(USER_DEVICE_PUBLIC_KEYS_COLLECTION);
  const res = await col.deleteOne({
    userId: userId.trim(),
    deviceId: deviceId.trim(),
  });
  return res.deletedCount === 1;
}
