import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../../config/env.js';
import type { MediaUploadMimeType } from '../../validation/schemas.js';
import { getS3ClientForPresignPut } from './s3Client.js';
import { buildUserMediaObjectKey } from './userMediaUpload.js';

const DEFAULT_NAME_BY_MIME: Record<MediaUploadMimeType, string> = {
  'image/jpeg': 'upload.jpg',
  'image/png': 'upload.png',
  'image/webp': 'upload.webp',
  'image/gif': 'upload.gif',
  'video/mp4': 'upload.mp4',
  'video/webm': 'upload.webm',
  'video/quicktime': 'upload.mov',
  'video/ogg': 'upload.ogv',
};

export function defaultUploadFilenameForContentType(
  contentType: MediaUploadMimeType,
): string {
  return DEFAULT_NAME_BY_MIME[contentType];
}

export type PresignPutUserMediaResult = {
  method: 'PUT';
  url: string;
  key: string;
  bucket: string;
  expiresAt: string;
  /** Headers the client should send on **`PUT`** (must match the signature). */
  headers: Record<string, string>;
};

/**
 * Issues a short-lived pre-signed **`PUT`** URL for **`users/{userId}/…`** keys (same layout as **`POST /media/upload`**).
 */
export async function presignPutUserMedia(
  env: Env,
  userId: string,
  input: {
    contentType: MediaUploadMimeType;
    contentLength: number;
    filename: string;
  },
): Promise<PresignPutUserMediaResult> {
  const client = getS3ClientForPresignPut(env);
  if (!client) {
    throw new Error('S3 presign requires S3_BUCKET and credentials');
  }
  const key = buildUserMediaObjectKey(env, userId, input.filename);
  const ttlSeconds = env.MEDIA_PRESIGN_TTL_SECONDS;
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });
  const url = await getSignedUrl(client, command, { expiresIn: ttlSeconds });
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  return {
    method: 'PUT',
    url,
    key,
    bucket: env.S3_BUCKET!,
    expiresAt,
    headers: {
      'Content-Type': input.contentType,
      'Content-Length': String(input.contentLength),
    },
  };
}
