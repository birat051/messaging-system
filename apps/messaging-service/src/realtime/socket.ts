import type { Server as HttpServer } from 'node:http';
import { createClient } from 'redis';
import { Server as SocketIoServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getSocketClientIp } from '../auth/getClientIp.js';
import { AppError } from '../errors/AppError.js';
import { loadEnv } from '../config/env.js';
import { logger } from '../logger.js';
import { sendMessageForUser } from '../messages/sendMessage.js';
import { messageDocumentToApi } from '../messages/messageApiShape.js';
import { isMessageSendRateLimited } from '../messages/messageSendRateLimit.js';
import { flushLastSeenToMongo } from '../presence/flushLastSeenToMongo.js';
import { setLastSeen } from '../presence/lastSeen.js';
import { resolveLastSeenForUser } from '../presence/resolveLastSeen.js';
import { formatZodError } from '../validation/formatZodError.js';
import { sendMessageRequestSchema } from '../validation/schemas.js';
import { parseGetLastSeenPayload } from './presenceSocketPayload.js';
import { resolveSocketAuth } from './socketAuth.js';

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
 *
 * **Auth:** JWT / dev user id is validated **once** in the **`connection`** handler (`resolveSocketAuth` →
 * **`socket.data.authAtConnect`**). Inbound events such as **`message:send`** only read that snapshot — they do
 * not re-verify tokens or reload the user from the database.
 *
 * **Rate limits:** **`message:send`** shares Redis fixed-window caps with **`POST /messages`** (**`MESSAGE_SEND_RATE_LIMIT_*`**)
 * — per **user**, per **client IP**, and per **socket id** (socket path only).
 *
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

  io.on('connection', async (socket) => {
    // Authentication is resolved once here; `message:send` and other handlers use `authAtConnect` only.
    socket.data.authAtConnect = await resolveSocketAuth(socket, env);

    const userId =
      socket.data.authAtConnect.kind === 'ok'
        ? socket.data.authAtConnect.user.id
        : readUserIdFromHandshake(socket.handshake.auth);

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

    socket.on(
      'message:send',
      async (raw: unknown, ack?: (r: unknown) => void) => {
        if (typeof ack !== 'function') {
          logger.warn(
            { socketId: socket.id },
            'message:send missing acknowledgement callback',
          );
          return;
        }

        // Handshake auth only — see `connection` handler; no JWT / DB lookup per message.
        const auth = socket.data.authAtConnect;
        if (auth.kind === 'email_not_verified') {
          ack({
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Verify your email before using this resource',
          });
          return;
        }
        if (auth.kind !== 'ok') {
          ack({
            code: 'UNAUTHORIZED',
            message: env.JWT_SECRET?.trim()
              ? 'Missing or invalid bearer token'
              : 'Authentication required',
          });
          return;
        }

        const ip = getSocketClientIp(socket);
        if (
          await isMessageSendRateLimited(env, {
            userId: auth.user.id,
            ip,
            socketId: socket.id,
          })
        ) {
          ack({
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many message send requests; try again later',
          });
          return;
        }

        const parsed = sendMessageRequestSchema.safeParse(raw);
        if (!parsed.success) {
          ack({
            code: 'INVALID_REQUEST',
            message: formatZodError(parsed.error),
          });
          return;
        }

        try {
          const msg = await sendMessageForUser(auth.user.id, parsed.data);
          ack(messageDocumentToApi(msg));
        } catch (err: unknown) {
          if (err instanceof AppError) {
            ack({
              code: err.code,
              message: err.message,
            });
            return;
          }
          logger.error({ err, socketId: socket.id }, 'message:send failed');
          ack({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          });
        }
      },
    );

    logger.info(
      {
        socketId: socket.id,
        hasUserId: Boolean(userId),
        authKind: socket.data.authAtConnect.kind,
      },
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
