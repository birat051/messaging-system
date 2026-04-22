import { Upload } from '@aws-sdk/lib-storage';
import type { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';

function safeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  return base || 'file';
}

/** Prefix for keys owned by **`userId`** (includes optional **`S3_KEY_PREFIX`**). */
export function userMediaKeyPrefixForUser(env: Env, userId: string): string {
  const prefix = env.S3_KEY_PREFIX?.replace(/^\/+|\/+$/g, '').trim();
  const middle = `users/${userId}/`;
  return prefix ? `${prefix}/${middle}` : middle;
}

/** True when **`rawKey`** is a **`users/{userId}/…`** object key for this deployment (same layout as presign / upload). */
export function isUserMediaObjectKeyOwnedByUser(
  env: Env,
  userId: string,
  rawKey: string,
): boolean {
  const key = rawKey.replace(/^\/+/, '').trim();
  if (!key) {
    return false;
  }
  return key.startsWith(userMediaKeyPrefixForUser(env, userId));
}

/** Object key under **`users/{userId}/…`** — same layout as **`POST /v1/media/upload`**. */
export function buildUserMediaObjectKey(
  env: Env,
  userId: string,
  filename: string,
): string {
  const prefix = env.S3_KEY_PREFIX?.replace(/^\/+|\/+$/g, '').trim();
  const middle = `users/${userId}/${randomUUID()}-${safeFilename(filename)}`;
  return prefix ? `${prefix}/${middle}` : middle;
}

/** Path-style public URL: `{base}/{bucket}/{key}` with per-segment encoding. */
export function publicObjectUrl(env: Env, key: string): string | null {
  if (!env.S3_PUBLIC_BASE_URL || !env.S3_BUCKET) {
    return null;
  }
  const base = env.S3_PUBLIC_BASE_URL.replace(/\/$/, '');
  const path = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `${base}/${encodeURIComponent(env.S3_BUCKET)}/${path}`;
}

export async function uploadUserMediaToS3(
  env: Env,
  client: S3Client,
  userId: string,
  file: { buffer: Buffer; originalname: string; mimetype: string },
): Promise<{ key: string; url: string | null }> {
  const key = buildUserMediaObjectKey(env, userId, file.originalname);
  const managed = new Upload({
    client,
    params: {
      Bucket: env.S3_BUCKET!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    },
  });
  await managed.done();
  return { key, url: publicObjectUrl(env, key) };
}
