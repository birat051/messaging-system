import { loadEnv } from './config/env.js';
import { mongoPing } from './db/mongo.js';
import { rabbitPing } from './messaging/rabbitmq.js';
import { redisPing } from './redis/redis.js';
import { headBucketOk } from './storage/s3Health.js';
import { getS3Client } from './storage/s3Client.js';

/**
 * Readiness gate for `/v1/ready`.
 */
export async function isReady(): Promise<boolean> {
  if (!(await mongoPing())) {
    return false;
  }
  if (!(await redisPing())) {
    return false;
  }
  if (!(await rabbitPing())) {
    return false;
  }

  const env = loadEnv();
  const s3 = getS3Client(env);
  if (s3 && env.S3_BUCKET) {
    if (!(await headBucketOk(s3, env.S3_BUCKET))) {
      return false;
    }
  }

  return true;
}
