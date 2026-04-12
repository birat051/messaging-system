import { MongoClient, type Db } from 'mongodb';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let client: MongoClient | null = null;

/**
 * Connect a pooled MongoClient (see `MONGODB_MAX_POOL_SIZE` in env). Idempotent.
 */
export async function connectMongo(): Promise<MongoClient> {
  if (client) {
    return client;
  }
  const env = loadEnv();
  const mongoClient = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  await mongoClient.connect();
  await mongoClient.db('admin').command({ ping: 1 });
  client = mongoClient;
  logger.info(
    { dbName: env.MONGODB_DB_NAME, maxPoolSize: env.MONGODB_MAX_POOL_SIZE },
    'MongoDB connected',
  );
  return client;
}

export async function disconnectMongo(): Promise<void> {
  if (!client) {
    return;
  }
  const c = client;
  client = null;
  await c.close();
  logger.info('MongoDB connection closed');
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoDB not connected');
  }
  return client;
}

export function getDb(): Db {
  const env = loadEnv();
  return getMongoClient().db(env.MONGODB_DB_NAME);
}

/** Used by `/v1/ready` — true when the driver can run a ping on the deployment. */
export async function mongoPing(): Promise<boolean> {
  if (!client) {
    return false;
  }
  try {
    await client.db('admin').command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
