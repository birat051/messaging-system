import { mongoPing } from './db/mongo.js';
import { rabbitPing } from './messaging/rabbitmq.js';
import { redisPing } from './redis/redis.js';

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
  return rabbitPing();
}
