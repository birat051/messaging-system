import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';

export async function headBucketOk(
  client: S3Client,
  bucket: string,
): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}
