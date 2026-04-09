import type { Channel, ChannelModel } from 'amqplib';
import { connect as amqpConnect } from 'amqplib';
import { loadEnv } from '../config/env.js';
import { logger } from '../logger.js';

/** Topic exchange for persisted-message routing; Socket.IO is last-mile delivery (PROJECT_PLAN.md §3.2). */
export const MESSAGING_EVENTS_EXCHANGE = 'messaging.events';

/** Routing key prefix for outbound chat events (extend per user/conversation as features land). */
export const MESSAGE_ROUTING_PREFIX = 'message';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let queueName: string | null = null;
let consumerTag: string | null = null;

function instanceQueueName(): string {
  const env = loadEnv();
  const safe = env.MESSAGING_INSTANCE_ID.replace(/[^a-zA-Z0-9._-]/g, '-').slice(
    0,
    200,
  );
  return `messaging.node.${safe || 'default'}`;
}

/**
 * Connect, declare topic exchange + per-instance queue bound to `message.#`.
 * Each replica uses a distinct queue name so every instance receives a copy to fan out to local Socket.IO rooms.
 */
export async function connectRabbit(): Promise<void> {
  if (channel && connection) {
    return;
  }
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
      ch.ack(msg);
      logger.debug(
        {
          routingKey: msg.fields.routingKey,
          queue: queueName,
        },
        'rabbitmq message received (stub consumer)',
      );
    },
    { noAck: false },
  );
  consumerTag = tag;

  logger.info(
    { exchange: MESSAGING_EVENTS_EXCHANGE, queue: queueName },
    'RabbitMQ topology ready',
  );
}

export async function disconnectRabbit(): Promise<void> {
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
