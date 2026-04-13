import 'fake-indexeddb/auto';
import { arrayBufferToBase64 } from '@/common/crypto/encoding';
import { generateP256EcdhKeyPair } from '@/common/crypto/keypair';
import { encryptUtf8ToE2eeBody } from '@/common/crypto/messageEcies';
import { createTestStore } from '@/common/test-utils/renderWithProviders';
import type { components } from '@/generated/api-types';
import {
  appendIncomingMessageIfNew,
  messagingInitialState,
  replaceOptimisticMessage,
  type Message,
} from '@/modules/home/stores/messagingSlice';
import * as senderPlaintextLocalStore from '@/common/senderPlaintext/senderPlaintextLocalStore';
import { afterEach, describe, expect, it, vi } from 'vitest';

type User = components['schemas']['User'];

function flushPersist(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('senderPlaintextPersistListener', () => {
  afterEach(async () => {
    await senderPlaintextLocalStore.__deleteSenderPlaintextDbForTests();
  });

  it('writes IndexedDB after replaceOptimisticMessage when server body is E2EE', async () => {
    const cid = 'conv-1';
    const userId = 'user-a';
    const optimisticId = 'client:eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const plain = 'Hello from me';
    const pair = await generateP256EcdhKeyPair();
    const subtle = globalThis.crypto.subtle;
    const spkiDer = await subtle.exportKey('spki', pair.publicKey);
    const recipientSpkiB64 = arrayBufferToBase64(spkiDer);
    const wire = await encryptUtf8ToE2eeBody(plain, recipientSpkiB64);

    const serverMsg: Message = {
      id: 'm-e2ee',
      conversationId: cid,
      senderId: userId,
      body: wire,
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };

    const user: User = {
      id: userId,
      email: 'a@b.com',
      emailVerified: true,
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

  it('writes IndexedDB after appendIncomingMessageIfNew reconciles optimistic with E2EE', async () => {
    const cid = 'conv-1';
    const userId = 'user-b';
    const optimisticId = 'client:22222222-2222-2222-2222-222222222222';
    const plain = 'hi';
    const pair = await generateP256EcdhKeyPair();
    const subtle = globalThis.crypto.subtle;
    const spkiDer = await subtle.exportKey('spki', pair.publicKey);
    const recipientSpkiB64 = arrayBufferToBase64(spkiDer);
    const wire = await encryptUtf8ToE2eeBody(plain, recipientSpkiB64);

    const serverMsg: Message = {
      id: 'm-real',
      conversationId: cid,
      senderId: userId,
      body: wire,
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };

    const user: User = {
      id: userId,
      email: 'b@b.com',
      emailVerified: true,
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

  it('does not write IndexedDB when no signed-in user (listener no-op)', async () => {
    const cid = 'conv-1';
    const userId = 'user-a';
    const optimisticId = 'client:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const plain = 'x';
    const pair = await generateP256EcdhKeyPair();
    const subtle = globalThis.crypto.subtle;
    const spkiDer = await subtle.exportKey('spki', pair.publicKey);
    const recipientSpkiB64 = arrayBufferToBase64(spkiDer);
    const wire = await encryptUtf8ToE2eeBody(plain, recipientSpkiB64);

    const serverMsg: Message = {
      id: 'm-no-auth',
      conversationId: cid,
      senderId: userId,
      body: wire,
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
