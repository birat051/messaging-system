import { S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../config/env.js';

let cached: S3Client | null | undefined;

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
}
