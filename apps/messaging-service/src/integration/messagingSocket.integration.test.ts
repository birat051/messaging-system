/**
 * Requires MongoDB, Redis, and RabbitMQ (e.g. `docker compose -f infra/dev/docker-compose.yml up -d mongo redis rabbitmq`).
 * Broker URL defaults to **`amqp://messaging:messaging@127.0.0.1:5672`** (same as Compose **`RABBITMQ_*`** defaults), not **`guest:guest`**, so integration is not broken by a dev **`.env`** that targets a different broker. Override with **`MESSAGING_INTEGRATION_RABBITMQ_URL`** if needed.
 *
 * Run: `MESSAGING_INTEGRATION=1 npm run test:integration`
 *
 * Dynamic imports keep `loadEnv()` from caching defaults before `process.env` is set below.
 *
 * **`publishMessage` must be spied before `socket.ts` / `sendMessage.ts` load** so the live export
 * used for sends is the spy (otherwise publishes may not reach RabbitMQ).
 */
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as SocketIoServer } from 'socket.io';
import type { Env } from '../config/env.js';

const enabled = process.env.MESSAGING_INTEGRATION === '1';

describe.skipIf(!enabled)('integration: A→B Socket.IO + RabbitMQ', () => {
  let testEnv: Env;
  let httpServer: HttpServer | undefined;
  let io: SocketIoServer | undefined;
  let baseUrl: string;
  let userA: { id: string };
  let userB: { id: string };
  /** Stable per-run id for unique **`deviceId`** rows in multi-device tests. */
  let integrationRunId: string;
  let publishSpy: MockInstance<
    (routingKey: string, payload: unknown) => Promise<boolean>
  >;
  let disconnectRabbit: (() => Promise<void>) | undefined;
  let disconnectRedis: (() => Promise<void>) | undefined;
  let disconnectMongo: (() => Promise<void>) | undefined;
  let closeSocketIo: ((s: SocketIoServer) => Promise<void>) | undefined;
  let setMessagingSocketIoServer: ((s: SocketIoServer | null) => void) | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/messaging_integration';
    process.env.MONGODB_DB_NAME ??= 'messaging_integration';
    process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
    process.env.RABBITMQ_URL =
      process.env.MESSAGING_INTEGRATION_RABBITMQ_URL?.trim() ||
      'amqp://messaging:messaging@127.0.0.1:5672';
    const integrationDir = dirname(fileURLToPath(import.meta.url));
    process.env.OPENAPI_SPEC_PATH = join(
      integrationDir,
      '../../../../docs/openapi/openapi.yaml',
    );

    const { resetEnvCacheForTests } = await import('../config/env.js');
    resetEnvCacheForTests();

    const { loadEnv } = await import('../config/env.js');
    const rabbitmq = await import('../data/messaging/rabbitmq.js');
    publishSpy = vi.spyOn(rabbitmq, 'publishMessage');
    const { createApp } = await import('../app.js');
    const { connectMongo, disconnectMongo: dm, getDb } = await import(
      '../data/db/mongo.js'
    );
    const { ensureConversationIndexes } = await import(
      '../data/conversations/conversations.collection.js'
    );
    const { ensureMessageIndexes } = await import(
      '../data/messages/messages.collection.js'
    );
    const { ensureConversationReadsIndexes } = await import(
      '../data/conversationReads/conversation_reads.collection.js'
    );
    const { ensureUserIndexes } = await import(
      '../data/users/users.collection.js'
    );
    const { connectRedis, disconnectRedis: dr } = await import(
      '../data/redis/redis.js'
    );
    const { createUser } = await import('../data/users/repo.js');
    const { attachSocketIo, closeSocketIo: cs } = await import(
      '../utils/realtime/socket.js'
    );

    disconnectRabbit = rabbitmq.disconnectRabbit;
    disconnectMongo = dm;
    disconnectRedis = dr;
    closeSocketIo = cs;
    setMessagingSocketIoServer = rabbitmq.setMessagingSocketIoServer;

    const env = loadEnv();
    testEnv = env;
    await connectMongo();
    const db = getDb();
    await ensureUserIndexes(db);
    await ensureConversationIndexes(db);
    await ensureMessageIndexes(db);
    await ensureConversationReadsIndexes(db);
    await connectRedis();
    try {
      await rabbitmq.connectRabbit();
    } catch (cause) {
      throw new Error(
        [
          'RabbitMQ connection failed during integration setup.',
          'Ensure the broker is running, e.g. `docker compose -f infra/dev/docker-compose.yml up -d rabbitmq`.',
          'This suite uses `amqp://messaging:messaging@127.0.0.1:5672` by default (Compose `RABBITMQ_USER` / `RABBITMQ_PASS`).',
          'Set `MESSAGING_INTEGRATION_RABBITMQ_URL` if your broker uses different credentials or host.',
        ].join(' '),
        { cause },
      );
    }

    const app = createApp(env);
    const srv = createServer(app);
    httpServer = srv;
    io = await attachSocketIo(srv);
    setMessagingSocketIoServer(io);

    await new Promise<void>((resolve, reject) => {
      srv.listen(0, () => {
        resolve();
      });
      srv.once('error', reject);
    });

    const addr = srv.address();
    if (addr === null || typeof addr === 'string') {
      throw new Error('expected bound port');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    integrationRunId = suffix;
    const t = Date.now();
    userA = await createUser({
      email: `a-${suffix}@example.com`,
      password: 'test-password-1',
      username: `ua${t}`,
      emailVerified: true,
    });
    userB = await createUser({
      email: `b-${suffix}@example.com`,
      password: 'test-password-2',
      username: `ub${t}`,
      emailVerified: true,
    });
  }, 60_000);

  afterAll(async () => {
    publishSpy?.mockRestore();
    setMessagingSocketIoServer?.(null);
    if (io !== undefined && closeSocketIo !== undefined) {
      try {
        await closeSocketIo(io);
      } catch {
        /* ignore */
      }
    }
    if (httpServer !== undefined && httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (disconnectRabbit !== undefined) {
      await disconnectRabbit();
    }
    if (disconnectRedis !== undefined) {
      await disconnectRedis();
    }
    if (disconnectMongo !== undefined) {
      await disconnectMongo();
    }
  }, 60_000);

  function connectClient(userId: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const s = clientIo(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: { userId },
        reconnection: false,
        forceNew: true,
      });
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });
  }

  it(
    'B receives message:new; exactly one broker publish to message.user.<B> (plus one sender echo to A)',
    async () => {
      publishSpy.mockClear();

      const socketB = await connectClient(userB.id);
      const received = new Promise<unknown>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('timeout waiting for message:new')),
          25_000,
        );
        socketB.once('message:new', (payload: unknown) => {
          clearTimeout(t);
          resolve(payload);
        });
      });

      /** Same process as REST `POST /messages` — exercises persist + Rabbit + consumer `io.to` emit. */
      const { sendMessageForUser } = await import(
        '../data/messages/sendMessage.js'
      );
      await sendMessageForUser(testEnv, userA.id, {
        recipientUserId: userB.id,
        body: 'hello-integration',
      });

      const payload = await received;
      expect(payload).toMatchObject({
        senderId: userA.id,
        body: 'hello-integration',
      });

      const toRecipient = publishSpy.mock.calls.filter(
        (c) => c[0] === `message.user.${userB.id}`,
      );
      const toSenderEcho = publishSpy.mock.calls.filter(
        (c) => c[0] === `message.user.${userA.id}`,
      );
      expect(toRecipient).toHaveLength(1);
      expect(toSenderEcho).toHaveLength(1);

      socketB.disconnect();
    },
    35_000,
  );

  /**
   * **Repro (E2EE on wire):** Service stores **`body`** as an opaque string; **B** must still get **`message:new`**
   * with the same ciphertext (matches product checklist: sender uses E2EE **`body`**, **B** receives real-time).
   */
  it(
    'B receives message:new when body is opaque E2EE-style string',
    async () => {
      publishSpy.mockClear();

      const socketB = await connectClient(userB.id);
      const received = new Promise<unknown>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('timeout waiting for message:new')),
          25_000,
        );
        socketB.once('message:new', (payload: unknown) => {
          clearTimeout(t);
          resolve(payload);
        });
      });

      const { sendMessageForUser } = await import(
        '../data/messages/sendMessage.js',
      );
      const opaqueBody = 'E2EE_JSON_V1:eyJhbGciOiJub25lIn0';
      await sendMessageForUser(testEnv, userA.id, {
        recipientUserId: userB.id,
        body: opaqueBody,
      });

      const payload = await received;
      expect(payload).toMatchObject({
        senderId: userA.id,
        body: opaqueBody,
      });

      socketB.disconnect();
    },
    35_000,
  );

  /**
   * **(A) Fan-out / skip:** Recipient routing key **`message.user.<B>`** carries a **flat** `Message`
   * JSON (no **`skipSocketId`**). Sender echo **`message.user.<A>`** wraps **`{ message, skipSocketId }`**
   * so **`io.to('user:A').except(originSocketId)`** does not double-notify the sending tab — it must **not**
   * affect **`message.user.<B>`** delivery to **B**.
   */
  it(
    'fan-out / skip: A sends via socket message:send; B receives message:new; recipient publish is flat; sender echo has skipSocketId',
    async () => {
      publishSpy.mockClear();

      const socketA = await connectClient(userA.id);
      const socketB = await connectClient(userB.id);

      const bIncoming = new Promise<unknown>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('timeout waiting for B message:new')),
          25_000,
        );
        socketB.once('message:new', (payload: unknown) => {
          clearTimeout(t);
          resolve(payload);
        });
      });

      const ackPromise = new Promise<unknown>((resolve, reject) => {
        socketA.emit(
          'message:send',
          { recipientUserId: userB.id, body: 'fanout-skip-test' },
          (r: unknown) => {
            if (r === undefined) {
              reject(new Error('missing ack'));
              return;
            }
            resolve(r);
          },
        );
      });

      const [ack, payload] = await Promise.all([ackPromise, bIncoming]);

      expect(ack).toMatchObject({
        senderId: userA.id,
        body: 'fanout-skip-test',
      });
      expect(payload).toMatchObject({
        senderId: userA.id,
        body: 'fanout-skip-test',
      });

      const toRecipient = publishSpy.mock.calls.filter(
        (c) => c[0] === `message.user.${userB.id}`,
      );
      const toSenderEcho = publishSpy.mock.calls.filter(
        (c) => c[0] === `message.user.${userA.id}`,
      );
      expect(toRecipient).toHaveLength(1);
      expect(toSenderEcho).toHaveLength(1);

      const recipPayload = toRecipient[0]![1];
      expect(recipPayload).not.toBeNull();
      expect(typeof recipPayload).toBe('object');
      if (typeof recipPayload === 'object' && recipPayload !== null) {
        expect('skipSocketId' in recipPayload).toBe(false);
        expect('message' in recipPayload).toBe(false);
      }

      const echoPayload = toSenderEcho[0]![1] as Record<string, unknown>;
      expect(echoPayload.message).toMatchObject({
        senderId: userA.id,
        body: 'fanout-skip-test',
      });
      expect(typeof echoPayload.skipSocketId).toBe('string');
      expect(echoPayload.skipSocketId).toBe(socketA.id);

      socketA.disconnect();
      socketB.disconnect();
    },
    35_000,
  );

  it(
    'B emits message:delivered; A receives message:delivered via Rabbit fan-out',
    async () => {
      publishSpy.mockClear();

      const socketA = await connectClient(userA.id);
      const socketB = await connectClient(userB.id);

      const { sendMessageForUser } = await import(
        '../data/messages/sendMessage.js'
      );
      const msg = await sendMessageForUser(testEnv, userA.id, {
        recipientUserId: userB.id,
        body: 'receipt-test',
      });

      const received = new Promise<unknown>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('timeout waiting for message:delivered')),
          25_000,
        );
        socketA.once('message:delivered', (payload: unknown) => {
          clearTimeout(t);
          resolve(payload);
        });
      });

      const ackResult = new Promise<unknown>((resolve, reject) => {
        socketB.emit(
          'message:delivered',
          { messageId: msg.id, conversationId: msg.conversationId },
          (r: unknown) => {
            if (r === undefined) {
              reject(new Error('missing ack'));
              return;
            }
            resolve(r);
          },
        );
      });

      const [payload, ack] = await Promise.all([received, ackResult]);

      expect(ack).toMatchObject({ ok: true });
      expect(payload).toMatchObject({
        messageId: msg.id,
        conversationId: msg.conversationId,
        userId: userB.id,
      });
      expect(typeof (payload as { at?: unknown }).at).toBe('string');

      const receiptPublishes = publishSpy.mock.calls.filter(
        (c) =>
          typeof c[0] === 'string' &&
          c[0].startsWith('message.receipt.'),
      );
      expect(receiptPublishes.length).toBe(2);

      socketA.disconnect();
      socketB.disconnect();
    },
    35_000,
  );

  /**
   * **Multi-device key sync (server smoke):** **A** sends a hybrid-style message with **`encryptedMessageKeys`**
   * only for **device A**; **`applyBatchSyncMessageKeys`** (trusted path) adds **device B**’s wrapped copy. Matches
   * checklist *device A → message → device B registers → A approves sync → B can load key* for the **persisted**
   * document shape (browser **`decryptMessageBody`** is manual / web-client).
   */
  it(
    'multi-device: hybrid message keyed for device A only; batch sync adds wrapped key for device B; GET sync lists B',
    async () => {
      const devA = `int-dev-a-${integrationRunId}`;
      const devB = `int-dev-b-${integrationRunId}`;
      const { registerOrUpdateDevice } = await import(
        '../data/userPublicKeys/repo.js',
      );
      const {
        applyBatchSyncMessageKeys,
        listSyncMessageKeysForUserDevice,
      } = await import('../data/messages/syncMessageKeys.js');
      const { findMessageById } = await import('../data/messages/repo.js');

      await registerOrUpdateDevice(userA.id, `spki-${devA}`, devA);
      await registerOrUpdateDevice(userA.id, `spki-${devB}`, devB);

      const { sendMessageForUser } = await import(
        '../data/messages/sendMessage.js',
      );
      const msg = await sendMessageForUser(testEnv, userA.id, {
        recipientUserId: userB.id,
        body: 'E2EE_INTEGRATION_BODY',
        encryptedMessageKeys: { [devA]: 'wrapped-symmetric-key-for-device-a' },
        algorithm: 'aes-256-gcm+p256-hybrid-v1',
      });

      expect(msg.encryptedMessageKeys?.[devA]).toBe(
        'wrapped-symmetric-key-for-device-a',
      );
      expect(msg.encryptedMessageKeys?.[devB]).toBeUndefined();

      const batch = await applyBatchSyncMessageKeys({
        userId: userA.id,
        sourceDeviceId: devA,
        targetDeviceId: devB,
        keys: [
          {
            messageId: msg.id,
            encryptedMessageKey: 'wrapped-symmetric-key-for-device-b',
          },
        ],
      });
      expect(batch.applied).toBe(1);
      expect(batch.skipped).toBe(0);

      const stored = await findMessageById(msg.id);
      expect(stored?.encryptedMessageKeys?.[devA]).toBe(
        'wrapped-symmetric-key-for-device-a',
      );
      expect(stored?.encryptedMessageKeys?.[devB]).toBe(
        'wrapped-symmetric-key-for-device-b',
      );

      const pageForB = await listSyncMessageKeysForUserDevice({
        userId: userA.id,
        deviceId: devB,
        limit: 50,
      });
      const row = pageForB.items.find((i) => i.messageId === msg.id);
      expect(row?.encryptedMessageKey).toBe(
        'wrapped-symmetric-key-for-device-b',
      );
    },
    35_000,
  );
});
