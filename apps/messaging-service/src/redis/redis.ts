import { createClient } from 'redis';
import { loadEnv } from '../config/env.js';
import { logger } from '../logger.js';

export type AppRedisClient = ReturnType<typeof createClient>;

let client: AppRedisClient | null = null;

export function getRedisClient(): AppRedisClient {
  if (!client) {
    throw new Error('Redis not connected');
  }
  return client;
}

/**
 * Pooled Redis connection for presence, rate limits, optional Socket.IO Redis adapter, etc.
 */
export async function connectRedis(): Promise<AppRedisClient> {
  if (client) {
    return client;
  }
  const env = loadEnv();
  const redis = createClient({ url: env.REDIS_URL });
  redis.on('error', (err: Error) => {
    logger.error({ err }, 'Redis client error');
  });
  await redis.connect();
  await redis.ping();
  client = redis;
  logger.info({ url: env.REDIS_URL }, 'Redis connected');
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) {
    return;
  }
  const c = client;
  client = null;
  try {
    await c.quit();
  } catch (err: unknown) {
    logger.error({ err }, 'Redis quit error');
  }
  logger.info('Redis disconnected');
}

export async function redisPing(): Promise<boolean> {
  const c = client;
  if (!c) {
    return false;
  }
  try {
    const pong = await c.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
