import type { Socket } from 'socket.io';
import type { Env } from '../../config/env.js';
import { getSocketClientIp } from '../auth/getClientIp.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js';
import { isMessageReceiptRateLimited } from '../../data/messages/messageReceiptRateLimit.js';
import {
  processConversationRead,
  processMessageDelivered,
  processMessageRead,
} from '../../data/messages/messageReceiptOps.js';
import { formatZodError } from '../../validation/formatZodError.js';
import { messageReceiptPayloadSchema } from '../../validation/schemas.js';

async function handleReceiptSocketEvent(
  socket: Socket,
  env: Env,
  raw: unknown,
  ack: ((r: unknown) => void) | undefined,
  run: (args: {
    actorUserId: string;
    messageId: string;
    conversationId: string;
    originSocketId?: string;
  }) => Promise<void>,
): Promise<void> {
  if (typeof ack !== 'function') {
    logger.warn(
      { socketId: socket.id },
      'receipt event missing acknowledgement callback',
    );
    return;
  }

  try {
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
      await isMessageReceiptRateLimited(env, {
        userId: auth.user.id,
        ip,
        socketId: socket.id,
      })
    ) {
      ack({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many receipt updates; try again later',
      });
      return;
    }

    const parsed = messageReceiptPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      ack({
        code: 'INVALID_REQUEST',
        message: formatZodError(parsed.error),
      });
      return;
    }

    await run({
      actorUserId: auth.user.id,
      messageId: parsed.data.messageId,
      conversationId: parsed.data.conversationId,
      originSocketId: socket.id,
    });
    ack({ ok: true });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      ack({
        code: err.code,
        message: err.message,
      });
      return;
    }
    logger.error({ err, socketId: socket.id }, 'receipt socket handler failed');
    ack({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

/** Inbound Feature 12 receipt events — **`userId`** is derived from **`authAtConnect`**, not the payload. */
export function registerMessageReceiptSocketHandlers(
  socket: Socket,
  env: Env,
): void {
  socket.on(
    'message:delivered',
    (raw: unknown, ack?: (r: unknown) => void) => {
      void handleReceiptSocketEvent(socket, env, raw, ack, (args) =>
        processMessageDelivered(args),
      );
    },
  );

  socket.on('message:read', (raw: unknown, ack?: (r: unknown) => void) => {
    void handleReceiptSocketEvent(socket, env, raw, ack, (args) =>
      processMessageRead(args),
    );
  });

  socket.on(
    'conversation:read',
    (raw: unknown, ack?: (r: unknown) => void) => {
      void handleReceiptSocketEvent(socket, env, raw, ack, (args) =>
        processConversationRead(args),
      );
    },
  );
}
