import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

/**
 * Bucket policy JSON allowing unauthenticated **`GetObject`** (browser **`img src`** to **`S3_PUBLIC_BASE_URL`** paths).
 * Exported for tests.
 */
export function anonymousGetObjectBucketPolicyJson(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowAnonymousGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucket}/*`,
      },
    ],
  });
}

/**
 * Allows anonymous read of objects in **`bucket`** (required for MinIO defaults when using public URLs).
 * Idempotent: replaces the bucket policy.
 */
export async function ensureAnonymousGetObjectPolicy(
  client: S3Client,
  bucket: string,
): Promise<void> {
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: anonymousGetObjectBucketPolicyJson(bucket),
    }),
  );
}

/**
 * Ensures the bucket exists (MinIO / dev: create if missing). Safe to call on startup.
 */
export async function ensureBucketExists(
  client: S3Client,
  bucket: string,
): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // Bucket missing or no access — try create (idempotent for MinIO).
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
      return;
    }
    throw err;
  }
}
