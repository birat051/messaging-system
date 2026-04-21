import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { connect as amqpConnect } from 'amqplib';
import type { Server as SocketIoServer } from 'socket.io';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  parseCallIncomingNotificationBrokerBody,
} from '../notifications/callIncomingNotification.js';
import {
  emitMessageNotificationDirect,
  emitMessageNotificationToGroupRoom,
} from '../notifications/messageNotification.js';
import { messageDocumentToApi } from '../messages/messageApiShape.js';
import { findUserById } from '../users/repo.js';

type MessageApiPayload = ReturnType<typeof messageDocumentToApi>;

/** Topic exchange for persisted-message routing; Socket.IO is last-mile delivery (PROJECT_PLAN.md §3.2). */
export const MESSAGING_EVENTS_EXCHANGE = 'messaging.events';

/** Routing key prefix for outbound chat events (extend per user/conversation as features land). */
export const MESSAGE_ROUTING_PREFIX = 'message';

/**
 * Broker routing for **`kind: call_incoming`** notifications (**Feature 7**): **`message.call.user.<calleeUserId>`**.
 * Publisher: **`webrtc:offer`** handler after relaying signaling; consumer: **`notification`** → **`user:<calleeUserId>`**.
 */
export const CALL_INCOMING_ROUTING_PREFIX = 'message.call.user.';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let queueName: string | null = null;
let consumerTag: string | null = null;

/** In-flight `connectRabbit()` so concurrent callers and `publishMessage` share one setup. */
let connectPromise: Promise<void> | null = null;

/** Set from `index.ts` after `attachSocketIo` so the consumer can emit (`PROJECT_PLAN.md` §3.2). */
let messagingSocketIo: SocketIoServer | null = null;

export function setMessagingSocketIoServer(io: SocketIoServer | null): void {
  messagingSocketIo = io;
}

/** Read-only access for same-process emits that skip the broker (e.g. **`device:sync_requested`**). */
export function getMessagingSocketIoServer(): SocketIoServer | null {
  return messagingSocketIo;
}

function instanceQueueName(): string {
  const env = loadEnv();
  const safe = env.MESSAGING_INSTANCE_ID.replace(/[^a-zA-Z0-9._-]/g, '-').slice(
    0,
    200,
  );
  return `messaging.node.${safe || 'default'}`;
}

/** `message.user.<userId>` → user id (direct 1:1 routing). */
function parseDirectUserRoutingKey(routingKey: string): string | null {
  const prefix = `${MESSAGE_ROUTING_PREFIX}.user.`;
  if (!routingKey.startsWith(prefix)) {
    return null;
  }
  const id = routingKey.slice(prefix.length).trim();
  return id.length > 0 ? id : null;
}

/** `message.group.<groupId>` → group id (group thread fan-out — **`PROJECT_PLAN.md`** §3.2). */
function parseGroupRoutingKey(routingKey: string): string | null {
  const prefix = `${MESSAGE_ROUTING_PREFIX}.group.`;
  if (!routingKey.startsWith(prefix)) {
    return null;
  }
  const id = routingKey.slice(prefix.length).trim();
  return id.length > 0 ? id : null;
}

/** `message.call.user.<calleeUserId>` → callee for **`notification`** **`kind: call_incoming`** (Feature 7). */
function parseCallIncomingRoutingKey(routingKey: string): string | null {
  if (!routingKey.startsWith(CALL_INCOMING_ROUTING_PREFIX)) {
    return null;
  }
  const id = routingKey.slice(CALL_INCOMING_ROUTING_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

/** `message.receipt.<userId>` → recipient of the Socket.IO fan-out (Feature 12). */
function parseReceiptRoutingKey(routingKey: string): string | null {
  const prefix = `${MESSAGE_ROUTING_PREFIX}.receipt.`;
  if (!routingKey.startsWith(prefix)) {
    return null;
  }
  const id = routingKey.slice(prefix.length).trim();
  return id.length > 0 ? id : null;
}

/**
 * Recipient publish: flat **`Message`** JSON from **`messageDocumentToApi`** (opaque **`body`** /
 * **`encryptedMessageKeys`** / **`iv`** / **`algorithm`** when present — **never** log those fields).
 * Sender echo: `{ message, skipSocketId? }` so the originating **`message:send`** socket is not notified twice
 * (`io.to(room).except(skipSocketId)`).
 */
function parseBrokerPayload(buf: Buffer): {
  message: MessageApiPayload;
  skipSocketId?: string;
} | null {
  let raw: unknown;
  try {
    raw = JSON.parse(buf.toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (
    'message' in o &&
    o.message !== null &&
    typeof o.message === 'object' &&
    o.message !== null &&
    typeof (o.message as { id?: unknown }).id === 'string'
  ) {
    return {
      message: o.message as MessageApiPayload,
      skipSocketId:
        typeof o.skipSocketId === 'string' && o.skipSocketId.length > 0
          ? o.skipSocketId
          : undefined,
    };
  }
  if (typeof o.id === 'string') {
    return { message: o as MessageApiPayload };
  }
  return null;
}

type ReceiptEmitPayload = {
  messageId: string;
  conversationId: string;
  userId: string;
  at: string;
};

function isReceiptSocketEventName(
  s: string,
): s is 'message:delivered' | 'message:read' | 'conversation:read' {
  return (
    s === 'message:delivered' ||
    s === 'message:read' ||
    s === 'conversation:read'
  );
}

function parseReceiptBrokerPayload(buf: Buffer): {
  socketEvent: 'message:delivered' | 'message:read' | 'conversation:read';
  data: ReceiptEmitPayload;
  skipSocketId?: string;
} | null {
  let raw: unknown;
  try {
    raw = JSON.parse(buf.toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const socketEvent = o.socketEvent;
  if (typeof socketEvent !== 'string' || !isReceiptSocketEventName(socketEvent)) {
    return null;
  }
  const data = o.data;
  if (data === null || typeof data !== 'object') {
    return null;
  }
  const d = data as Record<string, unknown>;
  if (
    typeof d.messageId !== 'string' ||
    typeof d.conversationId !== 'string' ||
    typeof d.userId !== 'string' ||
    typeof d.at !== 'string'
  ) {
    return null;
  }
  const skipSocketId =
    typeof o.skipSocketId === 'string' && o.skipSocketId.length > 0
      ? o.skipSocketId
      : undefined;
  return {
    socketEvent,
    data: {
      messageId: d.messageId,
      conversationId: d.conversationId,
      userId: d.userId,
      at: d.at,
    },
    skipSocketId,
  };
}

async function deliverCallIncomingNotificationToSocketIo(
  calleeUserId: string,
  content: Buffer,
): Promise<void> {
  const parsed = parseCallIncomingNotificationBrokerBody(content);
  if (parsed === null) {
    logger.warn({ calleeUserId }, 'rabbitmq: invalid call_incoming broker body');
    return;
  }
  const io = messagingSocketIo;
  if (!io) {
    logger.warn(
      { calleeUserId },
      'rabbitmq: Socket.IO not registered; skip call_incoming notification emit',
    );
    return;
  }
  const room = `user:${calleeUserId}`;
  io.to(room).emit('notification', parsed);
  const env = loadEnv();
  if (env.MESSAGING_REALTIME_DELIVERY_LOGS) {
    logger.info(
      {
        event: 'notification',
        kind: 'call_incoming',
        room,
        targetUserId: calleeUserId,
        callId: parsed.callId,
        callerUserId: parsed.callerUserId,
      },
      'rabbitmq: emitted call_incoming to Socket.IO room',
    );
  }
}

async function deliverReceiptToSocketIo(
  targetUserId: string,
  content: Buffer,
): Promise<void> {
  const parsed = parseReceiptBrokerPayload(content);
  if (parsed === null) {
    logger.warn({ targetUserId }, 'rabbitmq: invalid receipt broker body');
    return;
  }
  const io = messagingSocketIo;
  if (!io) {
    logger.warn(
      { routingKey: `message.receipt.${targetUserId}` },
      'rabbitmq: Socket.IO not registered; skip receipt emit',
    );
    return;
  }
  const room = `user:${targetUserId}`;
  const { socketEvent, data, skipSocketId } = parsed;
  if (skipSocketId) {
    io.to(room).except(skipSocketId).emit(socketEvent, data);
  } else {
    io.to(room).emit(socketEvent, data);
  }
  const env = loadEnv();
  if (env.MESSAGING_REALTIME_DELIVERY_LOGS) {
    logger.info(
      {
        event: socketEvent,
        room,
        targetUserId,
        messageId: data.messageId,
        conversationId: data.conversationId,
        skipSocketId: skipSocketId ?? null,
      },
      'rabbitmq: emitted receipt to Socket.IO room',
    );
  }
}

async function deliverMessageToSocketIo(msg: ConsumeMessage): Promise<void> {
  const routingKey = msg.fields.routingKey;
  const receiptTarget = parseReceiptRoutingKey(routingKey);
  if (receiptTarget !== null) {
    await deliverReceiptToSocketIo(receiptTarget, msg.content);
    return;
  }

  const callCalleeUserId = parseCallIncomingRoutingKey(routingKey);
  if (callCalleeUserId !== null) {
    await deliverCallIncomingNotificationToSocketIo(
      callCalleeUserId,
      msg.content,
    );
    return;
  }

  const groupId = parseGroupRoutingKey(routingKey);
  if (groupId !== null) {
    const parsed = parseBrokerPayload(msg.content);
    if (parsed === null) {
      logger.warn({ routingKey }, 'rabbitmq: invalid group message body');
      return;
    }
    const io = messagingSocketIo;
    if (!io) {
      logger.warn(
        { routingKey, groupId },
        'rabbitmq: Socket.IO not registered; skip group message emit',
      );
      return;
    }
    const room = `group:${groupId}`;
    const { message, skipSocketId } = parsed;
    if (skipSocketId) {
      io.to(room).except(skipSocketId).emit('message:new', message);
    } else {
      io.to(room).emit('message:new', message);
    }
    const sender = await findUserById(message.senderId);
    const senderDisplayName = sender?.displayName?.trim()
      ? sender.displayName.trim()
      : null;
    emitMessageNotificationToGroupRoom(
      io,
      groupId,
      message,
      senderDisplayName,
      null,
      skipSocketId ? { exceptSocketId: skipSocketId } : undefined,
    );
    const env = loadEnv();
    if (env.MESSAGING_REALTIME_DELIVERY_LOGS) {
      logger.info(
        {
          event: 'message:new',
          routingKey,
          room,
          groupId,
          messageId: message.id,
          skipSocketId: skipSocketId ?? null,
        },
        'rabbitmq: emitted group thread to Socket.IO room',
      );
    }
    return;
  }

  const userId = parseDirectUserRoutingKey(routingKey);
  if (userId === null) {
    logger.debug(
      { routingKey },
      'rabbitmq: skip emit (routing key not message.user.*, message.group.*, message.receipt.*, or message.call.user.*)',
    );
    return;
  }
  const parsed = parseBrokerPayload(msg.content);
  if (parsed === null) {
    logger.warn({ routingKey }, 'rabbitmq: invalid message body');
    return;
  }
  const io = messagingSocketIo;
  if (!io) {
    logger.warn(
      { routingKey, targetUserId: userId },
      'rabbitmq: Socket.IO not registered; skip message:new emit (call setMessagingSocketIoServer after attachSocketIo)',
    );
    return;
  }
  const room = `user:${userId}`;
  const { message, skipSocketId } = parsed;
  if (skipSocketId) {
    io.to(room).except(skipSocketId).emit('message:new', message);
  } else {
    io.to(room).emit('message:new', message);
    /** Recipient fan-out only — not the sender’s **`{ message, skipSocketId }`** echo (§8.3). */
    const sender = await findUserById(message.senderId);
    const senderDisplayName = sender?.displayName?.trim()
      ? sender.displayName.trim()
      : null;
    emitMessageNotificationDirect(io, userId, message, senderDisplayName);
  }
  const env = loadEnv();
  if (env.MESSAGING_REALTIME_DELIVERY_LOGS) {
    logger.info(
      {
        event: 'message:new',
        routingKey,
        room,
        targetUserId: userId,
        messageId: message.id,
        conversationId: message.conversationId,
        skipSocketId: skipSocketId ?? null,
      },
      'rabbitmq: emitted to Socket.IO room',
    );
  }
}

async function connectRabbitInner(): Promise<void> {
  const env = loadEnv();
  const conn = await amqpConnect(env.RABBITMQ_URL);
  connection = conn;

  conn.on('error', (err: Error) => {
    logger.error({ err }, 'RabbitMQ client error');
  });

  const ch = await conn.createChannel();
  channel = ch;

  await ch.assertExchange(MESSAGING_EVENTS_EXCHANGE, 'topic', {
    durable: true,
  });

  queueName = instanceQueueName();
  await ch.assertQueue(queueName, { durable: true });
  await ch.bindQueue(
    queueName,
    MESSAGING_EVENTS_EXCHANGE,
    `${MESSAGE_ROUTING_PREFIX}.#`,
  );

  const { consumerTag: tag } = await ch.consume(
    queueName,
    (msg) => {
      if (!msg) {
        return;
      }
      void (async () => {
        try {
          await deliverMessageToSocketIo(msg);
        } catch (err: unknown) {
          logger.error({ err, routingKey: msg.fields.routingKey }, 'rabbitmq consumer');
        } finally {
          ch.ack(msg);
        }
      })();
    },
    { noAck: false },
  );
  consumerTag = tag;

  logger.info(
    { exchange: MESSAGING_EVENTS_EXCHANGE, queue: queueName },
    'RabbitMQ topology ready',
  );
}

/**
 * Connect, declare topic exchange + per-instance queue bound to `message.#`.
 * Each replica uses a distinct queue name so every instance receives a copy to fan out to local Socket.IO rooms.
 */
export async function connectRabbit(): Promise<void> {
  if (channel && connection) {
    return;
  }
  if (!connectPromise) {
    connectPromise = connectRabbitInner();
  }
  try {
    await connectPromise;
  } finally {
    connectPromise = null;
  }
}

function encodePayload(
  payload: Buffer | string | Uint8Array | unknown,
): Buffer {
  if (Buffer.isBuffer(payload)) {
    return payload;
  }
  if (typeof payload === 'string') {
    return Buffer.from(payload, 'utf8');
  }
  if (payload instanceof Uint8Array) {
    return Buffer.from(payload);
  }
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

/**
 * Publish to `MESSAGING_EVENTS_EXCHANGE` with the given routing key.
 * Waits if `connectRabbit()` is still in progress; throws if RabbitMQ was never connected or the connection is gone.
 * @returns `true` if the message was queued to the socket, `false` if the channel is applying backpressure.
 */
export async function publishMessage(
  routingKey: string,
  payload: Buffer | string | Uint8Array | unknown,
): Promise<boolean> {
  if (!channel && !connectPromise) {
    throw new Error(
      'RabbitMQ not connected: call connectRabbit() before publishMessage',
    );
  }
  if (connectPromise) {
    await connectPromise;
  }
  const ch = channel;
  if (!ch) {
    throw new Error('RabbitMQ not connected');
  }
  const body = encodePayload(payload);
  return ch.publish(MESSAGING_EVENTS_EXCHANGE, routingKey, body, {
    persistent: true,
  });
}

export async function disconnectRabbit(): Promise<void> {
  connectPromise = null;
  const ch = channel;
  const conn = connection;
  const tag = consumerTag;
  channel = null;
  connection = null;
  queueName = null;
  consumerTag = null;

  if (ch) {
    try {
      if (tag) {
        await ch.cancel(tag);
      }
    } catch (err: unknown) {
      logger.error({ err }, 'RabbitMQ consumer cancel error');
    }
    try {
      await ch.close();
    } catch (err: unknown) {
      logger.error({ err }, 'RabbitMQ channel close error');
    }
  }
  if (conn) {
    try {
      await conn.close();
    } catch (err: unknown) {
      logger.error({ err }, 'RabbitMQ connection close error');
    }
  }
  logger.info('RabbitMQ disconnected');
}

export async function rabbitPing(): Promise<boolean> {
  const ch = channel;
  const q = queueName;
  if (!ch || !q) {
    return false;
  }
  try {
    await ch.checkQueue(q);
    return true;
  } catch {
    return false;
  }
}
