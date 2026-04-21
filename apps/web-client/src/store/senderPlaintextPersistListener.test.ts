import 'fake-indexeddb/auto';
import {
  encryptUtf8ToHybridSendPayload,
  mergeHybridDeviceRows,
} from '@/common/crypto/messageHybrid';
import { exportPublicKeySpkiBase64, generateP256EcdhKeyPair } from '@/common/crypto/keypair';
import { createTestStore } from '@/common/test-utils/renderWithProviders';
import type { components } from '@/generated/api-types';
import {
  appendIncomingMessageIfNew,
  messagingInitialState,
  recordOwnSendPlaintext,
  replaceOptimisticMessage,
  type Message,
} from '@/modules/home/stores/messagingSlice';
import * as senderPlaintextLocalStore from '@/common/senderPlaintext/senderPlaintextLocalStore';
import { afterEach, describe, expect, it, vi } from 'vitest';

type User = components['schemas']['User'];

async function hybridWireFromPlaintext(plain: string) {
  const pair = await generateP256EcdhKeyPair();
  const spki = await exportPublicKeySpkiBase64(pair.publicKey);
  const devices = mergeHybridDeviceRows([
    { deviceId: 'persist-wire-dev', publicKey: spki },
  ]);
  return encryptUtf8ToHybridSendPayload(plain, devices);
}

function flushPersist(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('senderPlaintextPersistListener', () => {
  afterEach(async () => {
    await senderPlaintextLocalStore.__deleteSenderPlaintextDbForTests();
  });

  it('writes IndexedDB after replaceOptimisticMessage when server body is hybrid wire', async () => {
    const cid = 'conv-1';
    const userId = 'user-a';
    const optimisticId = 'client:eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const plain = 'Hello from me';
    const hybrid = await hybridWireFromPlaintext(plain);

    const serverMsg: Message = {
      id: 'm-hybrid',
      conversationId: cid,
      senderId: userId,
      body: hybrid.body,
      iv: hybrid.iv,
      algorithm: hybrid.algorithm,
      encryptedMessageKeys: hybrid.encryptedMessageKeys,
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };

    const user: User = {
      id: userId,
      email: 'a@b.com',
      emailVerified: true,
      guest: false,
    };

    const store = createTestStore({
      auth: { user, accessToken: 'tok' },
      messaging: {
        ...messagingInitialState,
        messagesById: {
          [optimisticId]: {
            id: optimisticId,
            conversationId: cid,
            senderId: userId,
            body: plain,
            mediaKey: null,
            createdAt: new Date().toISOString(),
          },
        },
        messageIdsByConversationId: { [cid]: [optimisticId] },
        pendingOutgoingClientIdsByConversationId: { [cid]: [optimisticId] },
      },
    });

    store.dispatch(
      replaceOptimisticMessage({
        conversationId: cid,
        optimisticId,
        message: serverMsg,
      }),
    );

    await flushPersist();

    const got = await senderPlaintextLocalStore.get(userId, serverMsg.id);
    expect(got).toBe(plain);
  });

  it('writes IndexedDB after appendIncomingMessageIfNew reconciles optimistic with hybrid wire', async () => {
    const cid = 'conv-1';
    const userId = 'user-b';
    const optimisticId = 'client:22222222-2222-2222-2222-222222222222';
    const plain = 'hi';
    const hybrid = await hybridWireFromPlaintext(plain);

    const serverMsg: Message = {
      id: 'm-real',
      conversationId: cid,
      senderId: userId,
      body: hybrid.body,
      iv: hybrid.iv,
      algorithm: hybrid.algorithm,
      encryptedMessageKeys: hybrid.encryptedMessageKeys,
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };

    const user: User = {
      id: userId,
      email: 'b@b.com',
      emailVerified: true,
      guest: false,
    };

    const store = createTestStore({
      auth: { user, accessToken: 'tok' },
      messaging: {
        ...messagingInitialState,
        messagesById: {
          [optimisticId]: {
            id: optimisticId,
            conversationId: cid,
            senderId: userId,
            body: plain,
            mediaKey: null,
            createdAt: new Date().toISOString(),
          },
        },
        messageIdsByConversationId: { [cid]: [optimisticId] },
        pendingOutgoingClientIdsByConversationId: { [cid]: [optimisticId] },
      },
    });

    store.dispatch(
      appendIncomingMessageIfNew({ message: serverMsg, currentUserId: userId }),
    );

    await flushPersist();

    const got = await senderPlaintextLocalStore.get(userId, serverMsg.id);
    expect(got).toBe(plain);
  });

  it('writes IndexedDB after recordOwnSendPlaintext (first DM path)', async () => {
    const userId = 'user-first-dm';
    const plain = 'First message text';

    const user: User = {
      id: userId,
      email: 'c@b.com',
      emailVerified: true,
      guest: false,
    };

    const store = createTestStore({
      auth: { user, accessToken: 'tok' },
      messaging: messagingInitialState,
    });

    store.dispatch(
      recordOwnSendPlaintext({
        messageId: 'm-first',
        plaintext: plain,
      }),
    );

    await flushPersist();

    const got = await senderPlaintextLocalStore.get(userId, 'm-first');
    expect(got).toBe(plain);
  });

  it('does not write IndexedDB when no signed-in user (listener no-op)', async () => {
    const cid = 'conv-1';
    const userId = 'user-a';
    const optimisticId = 'client:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const plain = 'x';
    const hybrid = await hybridWireFromPlaintext(plain);

    const serverMsg: Message = {
      id: 'm-no-auth',
      conversationId: cid,
      senderId: userId,
      body: hybrid.body,
      iv: hybrid.iv,
      algorithm: hybrid.algorithm,
      encryptedMessageKeys: hybrid.encryptedMessageKeys,
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };

    const store = createTestStore({
      auth: { user: null, accessToken: null },
      messaging: {
        ...messagingInitialState,
        messagesById: {
          [optimisticId]: {
            id: optimisticId,
            conversationId: cid,
            senderId: userId,
            body: plain,
            mediaKey: null,
            createdAt: new Date().toISOString(),
          },
        },
        messageIdsByConversationId: { [cid]: [optimisticId] },
        pendingOutgoingClientIdsByConversationId: { [cid]: [optimisticId] },
      },
    });

    const putSpy = vi.spyOn(senderPlaintextLocalStore, 'put');

    store.dispatch(
      replaceOptimisticMessage({
        conversationId: cid,
        optimisticId,
        message: serverMsg,
      }),
    );

    await flushPersist();

    expect(putSpy).not.toHaveBeenCalled();
    putSpy.mockRestore();
  });
});
