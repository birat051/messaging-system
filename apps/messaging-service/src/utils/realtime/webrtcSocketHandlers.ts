import type { Server as SocketIoServer } from 'socket.io';
import type { Socket } from 'socket.io';
import { getSocketClientIp } from '../auth/getClientIp.js';
import type { Env } from '../../config/env.js';
import { assertWebRtcSignalingPeerAllowed } from '../../data/calls/webrtcSignalingAuthz.js';
import { isWebRtcSignalRateLimited } from '../../data/calls/webrtcSignalRateLimit.js';
import {
  CALL_INCOMING_ROUTING_PREFIX,
  publishMessage,
} from '../../data/messaging/rabbitmq.js';
import { buildCallIncomingKindNotificationPayload } from '../../data/notifications/callIncomingNotification.js';
import { findUserById } from '../../data/users/repo.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js';
import { formatZodError } from '../../validation/formatZodError.js';
import {
  webrtcAnswerSchema,
  webrtcHangupSchema,
  webrtcIceCandidateSchema,
  webrtcOfferSchema,
} from '../../validation/webrtcSignalingSchemas.js';

function ackError(
  ack: ((r: unknown) => void) | undefined,
  code: string,
  message: string,
): void {
  if (typeof ack === 'function') {
    ack({ ok: false, code, message });
  }
}

function ackOk(ack: ((r: unknown) => void) | undefined): void {
  if (typeof ack === 'function') {
    ack({ ok: true });
  }
}

/**
 * **1:1 WebRTC** — relay **SDP** and **ICE** between authenticated peers (**Feature 3**).
 * Events: **`webrtc:offer`**, **`webrtc:answer`**, **`webrtc:candidate`**, **`webrtc:hangup`** (client emits; server emits same
 * names to **`user:<peerId>`** with **`fromUserId`**).
 */
export function registerWebRtcSignalingHandlers(
  socket: Socket,
  io: SocketIoServer,
  env: Env,
): void {
  socket.on(
    'webrtc:offer',
    async (raw: unknown, ack?: (r: unknown) => void) => {
      try {
        if (typeof ack !== 'function') {
          logger.warn(
            { socketId: socket.id },
            'webrtc:offer missing acknowledgement callback',
          );
          return;
        }
        const auth = socket.data.authAtConnect;
        if (auth.kind === 'email_not_verified') {
          ackError(
            ack,
            'EMAIL_NOT_VERIFIED',
            'Verify your email before using this resource',
          );
          return;
        }
        if (auth.kind !== 'ok') {
          ackError(
            ack,
            'UNAUTHORIZED',
            env.JWT_SECRET?.trim()
              ? 'Missing or invalid bearer token'
              : 'Authentication required',
          );
          return;
        }

        const ip = getSocketClientIp(socket);
        if (
          await isWebRtcSignalRateLimited(env, {
            userId: auth.user.id,
            ip,
            socketId: socket.id,
          })
        ) {
          ackError(
            ack,
            'RATE_LIMIT_EXCEEDED',
            'Too many WebRTC signaling messages; try again later',
          );
          return;
        }

        const parsed = webrtcOfferSchema.safeParse(raw);
        if (!parsed.success) {
          ackError(ack, 'INVALID_REQUEST', formatZodError(parsed.error));
          return;
        }

        const { toUserId, callId, sdp, conversationId } = parsed.data;
        await assertWebRtcSignalingPeerAllowed(auth.user.id, toUserId);

        const caller = await findUserById(auth.user.id);
        const callerDisplayName = caller?.displayName?.trim()
          ? caller.displayName.trim()
          : null;
        const callerUsername = caller?.username?.trim()
          ? caller.username.trim()
          : null;

        io.to(`user:${toUserId}`).emit('webrtc:offer', {
          fromUserId: auth.user.id,
          callId,
          sdp,
          ...(conversationId !== undefined ? { conversationId } : {}),
          ...(callerDisplayName ? { callerDisplayName } : {}),
          ...(callerUsername ? { callerUsername } : {}),
        });
        const callIncomingPayload = buildCallIncomingKindNotificationPayload({
          callId,
          callerUserId: auth.user.id,
          callerDisplayName,
          sdp,
          conversationId,
        });
        try {
          await publishMessage(
            `${CALL_INCOMING_ROUTING_PREFIX}${toUserId}`,
            callIncomingPayload,
          );
        } catch (err: unknown) {
          logger.warn(
            { err, toUserId, callId },
            'webrtc:offer: publish call_incoming to broker failed',
          );
        }
        ackOk(ack);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          ackError(ack, err.code, err.message);
          return;
        }
        logger.error({ err, socketId: socket.id }, 'webrtc:offer failed');
        ackError(ack, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  socket.on(
    'webrtc:answer',
    async (raw: unknown, ack?: (r: unknown) => void) => {
      try {
        if (typeof ack !== 'function') {
          logger.warn(
            { socketId: socket.id },
            'webrtc:answer missing acknowledgement callback',
          );
          return;
        }
        const auth = socket.data.authAtConnect;
        if (auth.kind === 'email_not_verified') {
          ackError(
            ack,
            'EMAIL_NOT_VERIFIED',
            'Verify your email before using this resource',
          );
          return;
        }
        if (auth.kind !== 'ok') {
          ackError(
            ack,
            'UNAUTHORIZED',
            env.JWT_SECRET?.trim()
              ? 'Missing or invalid bearer token'
              : 'Authentication required',
          );
          return;
        }

        const ip = getSocketClientIp(socket);
        if (
          await isWebRtcSignalRateLimited(env, {
            userId: auth.user.id,
            ip,
            socketId: socket.id,
          })
        ) {
          ackError(
            ack,
            'RATE_LIMIT_EXCEEDED',
            'Too many WebRTC signaling messages; try again later',
          );
          return;
        }

        const parsed = webrtcAnswerSchema.safeParse(raw);
        if (!parsed.success) {
          ackError(ack, 'INVALID_REQUEST', formatZodError(parsed.error));
          return;
        }

        const { toUserId, callId, sdp, conversationId } = parsed.data;
        await assertWebRtcSignalingPeerAllowed(auth.user.id, toUserId);

        io.to(`user:${toUserId}`).emit('webrtc:answer', {
          fromUserId: auth.user.id,
          callId,
          sdp,
          ...(conversationId !== undefined ? { conversationId } : {}),
        });
        ackOk(ack);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          ackError(ack, err.code, err.message);
          return;
        }
        logger.error({ err, socketId: socket.id }, 'webrtc:answer failed');
        ackError(ack, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  socket.on(
    'webrtc:candidate',
    async (raw: unknown, ack?: (r: unknown) => void) => {
      try {
        if (typeof ack !== 'function') {
          logger.warn(
            { socketId: socket.id },
            'webrtc:candidate missing acknowledgement callback',
          );
          return;
        }
        const auth = socket.data.authAtConnect;
        if (auth.kind === 'email_not_verified') {
          ackError(
            ack,
            'EMAIL_NOT_VERIFIED',
            'Verify your email before using this resource',
          );
          return;
        }
        if (auth.kind !== 'ok') {
          ackError(
            ack,
            'UNAUTHORIZED',
            env.JWT_SECRET?.trim()
              ? 'Missing or invalid bearer token'
              : 'Authentication required',
          );
          return;
        }

        const ip = getSocketClientIp(socket);
        if (
          await isWebRtcSignalRateLimited(env, {
            userId: auth.user.id,
            ip,
            socketId: socket.id,
          })
        ) {
          ackError(
            ack,
            'RATE_LIMIT_EXCEEDED',
            'Too many WebRTC signaling messages; try again later',
          );
          return;
        }

        const parsed = webrtcIceCandidateSchema.safeParse(raw);
        if (!parsed.success) {
          ackError(ack, 'INVALID_REQUEST', formatZodError(parsed.error));
          return;
        }

        const { toUserId, callId, candidate, conversationId } = parsed.data;
        await assertWebRtcSignalingPeerAllowed(auth.user.id, toUserId);

        io.to(`user:${toUserId}`).emit('webrtc:candidate', {
          fromUserId: auth.user.id,
          callId,
          candidate,
          ...(conversationId !== undefined ? { conversationId } : {}),
        });
        ackOk(ack);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          ackError(ack, err.code, err.message);
          return;
        }
        logger.error({ err, socketId: socket.id }, 'webrtc:candidate failed');
        ackError(ack, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  socket.on(
    'webrtc:hangup',
    async (raw: unknown, ack?: (r: unknown) => void) => {
      try {
        if (typeof ack !== 'function') {
          logger.warn(
            { socketId: socket.id },
            'webrtc:hangup missing acknowledgement callback',
          );
          return;
        }
        const auth = socket.data.authAtConnect;
        if (auth.kind === 'email_not_verified') {
          ackError(
            ack,
            'EMAIL_NOT_VERIFIED',
            'Verify your email before using this resource',
          );
          return;
        }
        if (auth.kind !== 'ok') {
          ackError(
            ack,
            'UNAUTHORIZED',
            env.JWT_SECRET?.trim()
              ? 'Missing or invalid bearer token'
              : 'Authentication required',
          );
          return;
        }

        const ip = getSocketClientIp(socket);
        if (
          await isWebRtcSignalRateLimited(env, {
            userId: auth.user.id,
            ip,
            socketId: socket.id,
          })
        ) {
          ackError(
            ack,
            'RATE_LIMIT_EXCEEDED',
            'Too many WebRTC signaling messages; try again later',
          );
          return;
        }

        const parsed = webrtcHangupSchema.safeParse(raw);
        if (!parsed.success) {
          ackError(ack, 'INVALID_REQUEST', formatZodError(parsed.error));
          return;
        }

        const { toUserId, callId, conversationId } = parsed.data;
        await assertWebRtcSignalingPeerAllowed(auth.user.id, toUserId);

        io.to(`user:${toUserId}`).emit('webrtc:hangup', {
          fromUserId: auth.user.id,
          callId,
          ...(conversationId !== undefined ? { conversationId } : {}),
        });
        ackOk(ack);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          ackError(ack, err.code, err.message);
          return;
        }
        logger.error({ err, socketId: socket.id }, 'webrtc:hangup failed');
        ackError(ack, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );
}
