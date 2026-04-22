import { S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../../config/env.js';

let cached: S3Client | null | undefined;

let presignClientsByEndpoint: Map<string, S3Client> | undefined;

/**
 * Prefer **`S3_PRESIGN_ENDPOINT`**, then **`S3_PUBLIC_BASE_URL`** (browser-visible MinIO/S3 API), then **`S3_ENDPOINT`**.
 * Used only for **`getSignedUrl`** so the returned URL matches what the browser can reach.
 */
export function resolveS3PresignPutEndpoint(env: Env): string | undefined {
  const resolved =
    env.S3_PRESIGN_ENDPOINT?.trim() ||
    env.S3_PUBLIC_BASE_URL?.trim() ||
    env.S3_ENDPOINT?.trim();
  return resolved || undefined;
}

/**
 * Client for **`getSignedUrl`** on **`PutObject`** when the browser must use a different host than server-side **`S3_ENDPOINT`**
 * (e.g. Docker **`minio:9000`** vs **`localhost:9000`**).
 */
export function getS3ClientForPresignPut(env: Env): S3Client | null {
  if (!env.S3_BUCKET) {
    return null;
  }

  const defaultClient = getS3Client(env);
  if (!defaultClient) {
    return null;
  }

  const presignEndpoint = resolveS3PresignPutEndpoint(env);
  const serverEndpoint = env.S3_ENDPOINT?.trim() || '';
  if (!presignEndpoint || presignEndpoint === serverEndpoint) {
    return defaultClient;
  }

  const forcePathStyle =
    Boolean(env.S3_ENDPOINT) || env.S3_FORCE_PATH_STYLE;
  const credentials =
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined;

  if (!presignClientsByEndpoint) {
    presignClientsByEndpoint = new Map();
  }
  const cacheKey = `${presignEndpoint}|${String(forcePathStyle)}|${env.S3_REGION}`;
  const hit = presignClientsByEndpoint.get(cacheKey);
  if (hit) {
    return hit;
  }

  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: presignEndpoint,
    forcePathStyle,
    credentials,
  });
  presignClientsByEndpoint.set(cacheKey, client);
  return client;
}

/**
 * Returns a singleton S3 client when `S3_BUCKET` is configured; otherwise `null`.
 */
export function getS3Client(env: Env): S3Client | null {
  if (cached !== undefined) {
    return cached;
  }
  if (!env.S3_BUCKET) {
    cached = null;
    return null;
  }

  const forcePathStyle = Boolean(env.S3_ENDPOINT) || env.S3_FORCE_PATH_STYLE;

  const credentials =
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined;

  cached = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle,
    credentials,
  });
  return cached;
}

export function resetS3ClientForTests(): void {
  cached = undefined;
  presignClientsByEndpoint?.clear();
  presignClientsByEndpoint = undefined;
}
