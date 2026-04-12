import {
  CreateBucketCommand,
  HeadBucketCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

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
