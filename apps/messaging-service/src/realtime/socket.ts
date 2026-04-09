import type { Server as HttpServer } from 'node:http';
import { createClient } from 'redis';
import { Server as SocketIoServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { loadEnv } from '../config/env.js';
import { logger } from '../logger.js';
import { flushLastSeenToMongo } from '../presence/flushLastSeenToMongo.js';
import { setLastSeen } from '../presence/lastSeen.js';
import { resolveLastSeenForUser } from '../presence/resolveLastSeen.js';
import { parseGetLastSeenPayload } from './presenceSocketPayload.js';

/** Minimum ms between Redis writes per socket (~5s client heartbeat, allow clock drift). */
const HEARTBEAT_MIN_INTERVAL_MS = 4500;

let adapterPubClient: ReturnType<typeof createClient> | null = null;
let adapterSubClient: ReturnType<typeof createClient> | null = null;

function readUserIdFromHandshake(auth: unknown): string | undefined {
  if (auth === null || typeof auth !== 'object') {
    return undefined;
  }
  const userId = (auth as { userId?: unknown }).userId;
  if (typeof userId !== 'string') {
    return undefined;
  }
  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Socket.IO on the same HTTP server as Express (PROJECT_PLAN.md §3.2).
 * Optional Redis adapter for horizontal scale.
 * Last seen: client emits **`presence:heartbeat` every ~5s** while connected → Redis; on **disconnect** → flush to MongoDB (`users.lastSeenAt`) and clear Redis key.
 * Read path: **`presence:getLastSeen`** with `{ targetUserId }` + ack — Redis → Mongo → **`not_available`**.
 */
export async function attachSocketIo(
  httpServer: HttpServer,
): Promise<SocketIoServer> {
  const env = loadEnv();
  const corsOrigin = env.SOCKET_IO_CORS_ORIGIN;
  const io = new SocketIoServer(httpServer, {
    path: '/socket.io',
    cors: corsOrigin
      ? { origin: corsOrigin === '*' ? true : corsOrigin }
      : { origin: true },
  });

  if (env.SOCKET_IO_REDIS_ADAPTER) {
    const pubClient = createClient({ url: env.REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    adapterPubClient = pubClient;
    adapterSubClient = subClient;
    logger.info('Socket.IO Redis adapter enabled');
  }

  io.on('connection', (socket) => {
    const userId = readUserIdFromHandshake(socket.handshake.auth);
    let lastHeartbeatWriteMs = 0;

    const onHeartbeat = (): void => {
      if (!userId) {
        return;
      }
      const now = Date.now();
      if (now - lastHeartbeatWriteMs < HEARTBEAT_MIN_INTERVAL_MS) {
        return;
      }
      lastHeartbeatWriteMs = now;
      void setLastSeen(userId).catch((err: unknown) => {
        logger.error({ err, userId }, 'setLastSeen failed');
      });
    };

    socket.on('presence:heartbeat', onHeartbeat);

    // Authz: tighten who may query which targetUserId when JWT/session exists (Feature 2).
    socket.on(
      'presence:getLastSeen',
      async (raw: unknown, ack?: (r: unknown) => void) => {
        if (typeof ack !== 'function') {
          logger.warn(
            { socketId: socket.id },
            'presence:getLastSeen missing acknowledgement callback',
          );
          return;
        }
        const targetUserId = parseGetLastSeenPayload(raw);
        if (targetUserId === undefined) {
          ack({
            status: 'error',
            code: 'invalid_payload',
            message: 'expected { targetUserId: string }',
          });
          return;
        }
        try {
          const result = await resolveLastSeenForUser(targetUserId);
          ack(result);
        } catch (err: unknown) {
          logger.error({ err, targetUserId }, 'presence:getLastSeen failed');
          ack({
            status: 'error',
            code: 'internal_error',
            message: 'failed to resolve last seen',
          });
        }
      },
    );

    logger.info(
      { socketId: socket.id, hasUserId: Boolean(userId) },
      'socket.io connected',
    );

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'socket.io disconnected');
      if (userId) {
        void flushLastSeenToMongo(userId).catch((err: unknown) => {
          logger.error({ err, userId }, 'flushLastSeenToMongo failed');
        });
      }
    });
  });

  return io;
}

export async function closeSocketIo(io: SocketIoServer): Promise<void> {
  await io.close();

  const quit = async (
    client: ReturnType<typeof createClient> | null,
  ): Promise<void> => {
    if (!client) {
      return;
    }
    try {
      await client.quit();
    } catch (err: unknown) {
      logger.error({ err }, 'Redis adapter client quit error');
    }
  };

  await quit(adapterSubClient);
  adapterSubClient = null;
  await quit(adapterPubClient);
  adapterPubClient = null;
}
