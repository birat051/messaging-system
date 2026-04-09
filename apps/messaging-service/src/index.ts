import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectMongo, disconnectMongo, getDb } from './db/mongo.js';
import { connectRabbit, disconnectRabbit } from './messaging/rabbitmq.js';
import { connectRedis, disconnectRedis } from './redis/redis.js';
import { logger } from './logger.js';
import { attachSocketIo, closeSocketIo } from './realtime/socket.js';
import { ensureBucketExists } from './storage/ensureBucket.js';
import { getS3Client } from './storage/s3Client.js';
import { ensureUserIndexes } from './users/ensureIndexes.js';

async function main(): Promise<void> {
  const env = loadEnv();
  await connectMongo();
  await ensureUserIndexes(getDb());
  await connectRedis();
  await connectRabbit();

  const s3 = getS3Client(env);
  if (s3 && env.S3_BUCKET) {
    await ensureBucketExists(s3, env.S3_BUCKET);
    logger.info({ bucket: env.S3_BUCKET }, 'S3 bucket ready');
  }

  const app = createApp(env);
  const httpServer = createServer(app);
  const io = await attachSocketIo(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, nodeEnv: env.NODE_ENV },
      'messaging-service listening',
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'shutdown started');

    try {
      await closeSocketIo(io);
    } catch (err: unknown) {
      logger.error({ err }, 'Socket.IO close error');
    }

    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    } catch (err: unknown) {
      logger.error({ err }, 'HTTP server close error');
    }

    try {
      await disconnectRabbit();
    } catch (err: unknown) {
      logger.error({ err }, 'RabbitMQ disconnect error');
    }

    try {
      await disconnectRedis();
    } catch (err: unknown) {
      logger.error({ err }, 'Redis disconnect error');
    }

    try {
      await disconnectMongo();
    } catch (err: unknown) {
      logger.error({ err }, 'MongoDB disconnect error');
    }

    process.exit(0);
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'messaging-service failed to start');
  process.exit(1);
});
