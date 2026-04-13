import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectMongo, disconnectMongo, getDb } from './data/db/mongo.js';
import {
  connectRabbit,
  disconnectRabbit,
  setMessagingSocketIoServer,
} from './data/messaging/rabbitmq.js';
import { connectRedis, disconnectRedis } from './data/redis/redis.js';
import { logger } from './utils/logger.js';
import { attachSocketIo, closeSocketIo } from './utils/realtime/socket.js';
import { ensureBucketExists } from './data/storage/ensureBucket.js';
import { getS3Client } from './data/storage/s3Client.js';
import { ensureConversationReadsIndexes } from './data/conversationReads/conversation_reads.collection.js';
import { ensureConversationIndexes } from './data/conversations/conversations.collection.js';
import { ensureMessageIndexes } from './data/messages/messages.collection.js';
import { ensureSystemConfigIndexes } from './data/system_config/system_config.collection.js';
import { ensureUserPublicKeyIndexes } from './data/userPublicKeys/user_public_keys.collection.js';
import {
  ensureUserIndexes,
  ensureUserProfileFieldsBackfill,
} from './data/users/users.collection.js';

async function main(): Promise<void> {
  const env = loadEnv();
  await connectMongo();
  const db = getDb();
  await ensureUserIndexes(db);
  await ensureConversationIndexes(db);
  await ensureMessageIndexes(db);
  await ensureConversationReadsIndexes(db);
  await ensureUserPublicKeyIndexes(db);
  await ensureSystemConfigIndexes(db);
  await ensureUserProfileFieldsBackfill(db);
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
  /** Required so the RabbitMQ consumer can `io.to('user:<id>').emit('message:new', …)` — see `rabbitmq.ts`. */
  setMessagingSocketIoServer(io);
  logger.info('RabbitMQ consumer wired to Socket.IO for message:new / receipt fan-out');

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

    setMessagingSocketIoServer(null);

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
