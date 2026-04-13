import { describe, expect, it } from 'vitest';
import { arrayBufferToBase64 } from '@/common/crypto/encoding';
import { encryptUtf8ToE2eeBody } from '@/common/crypto/messageEcies';
import { generateP256EcdhKeyPair } from '@/common/crypto/keypair';
import type { components } from '@/generated/api-types';
import {
  appendIncomingMessageIfNew,
  appendMessageFromSend,
  hydrateMessagesFromFetch,
  hydrateSenderPlaintextFromDisk,
  mergeReceiptFanoutFromSocket,
  messagingReducer,
  replaceOptimisticMessage,
  setRecipientDirectoryKey,
} from './messagingSlice';
import { selectOutboundReceiptTickState } from './messagingSelectors';

type Message = components['schemas']['Message'];

const base = {
  activeConversationId: null,
  recipientDirectoryKeyByUserId: {},
  messagesById: {} as Record<string, Message>,
  messageIdsByConversationId: {} as Record<string, string[]>,
  pendingOutgoingClientIdsByConversationId: {} as Record<string, string[]>,
  outboundReceiptByMessageId: {} as Record<string, 'loading' | 'sent' | 'delivered' | 'seen'>,
  receiptsByMessageId: {} as Record<string, components['schemas']['MessageReceiptSummary']>,
  sendPendingByConversationId: {},
  sendErrorByConversationId: {},
  senderPlaintextByMessageId: {},
  decryptedBodyByMessageId: {},
};

describe('messagingSlice recipient directory keys', () => {
  it('setRecipientDirectoryKey stores the peer directory key', () => {
    const key = {
      userId: 'peer-x',
      publicKey:
        'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEeWtZ0jiCzy6i7c1fhDNcct9WUer1FC9027TeJwYmimeYcCDeAauszT90CsuigDh12qwCJ3yFUDcZurT22BWJrJA',
      keyVersion: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const state = messagingReducer(
      base,
      setRecipientDirectoryKey({ userId: 'peer-x', key }),
    );
    expect(state.recipientDirectoryKeyByUserId['peer-x']).toEqual(key);
  });
});

describe('messagingSlice outbound receipts', () => {
  const cid = 'conv-1';
  const userId = 'user-a';

  it('appendMessageFromSend sets loading for optimistic client ids', () => {
    const optimisticId = 'client:33333333-3333-3333-3333-333333333333';
    const optimistic: Message = {
      id: optimisticId,
      conversationId: cid,
      senderId: userId,
      body: 'x',
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };
    const state = messagingReducer(
      base,
      appendMessageFromSend({ conversationId: cid, message: optimistic }),
    );
    expect(state.outboundReceiptByMessageId[optimisticId]).toBe('loading');
  });
});

describe('messagingSlice optimistic reconciliation', () => {
  const cid = 'conv-1';
  const userId = 'user-a';

  it('replaceOptimisticMessage dedupes when server id was already inserted (message:new race)', () => {
    const optimisticId = 'client:11111111-1111-1111-1111-111111111111';
    const serverMsg: Message = {
      id: 'm-srv',
      conversationId: cid,
      senderId: userId,
      body: 'x',
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };
    const state = messagingReducer(
      {
        ...base,
        messagesById: {
          [optimisticId]: {
            id: optimisticId,
            conversationId: cid,
            senderId: userId,
            body: 'x',
            mediaKey: null,
            createdAt: new Date().toISOString(),
          },
          [serverMsg.id]: serverMsg,
        },
        messageIdsByConversationId: { [cid]: [optimisticId, serverMsg.id] },
        pendingOutgoingClientIdsByConversationId: { [cid]: [optimisticId] },
      },
      replaceOptimisticMessage({
        conversationId: cid,
        optimisticId,
        message: serverMsg,
      }),
    );
    expect(state.messageIdsByConversationId[cid]).toEqual([serverMsg.id]);
    expect(state.messagesById[optimisticId]).toBeUndefined();
    expect(state.pendingOutgoingClientIdsByConversationId[cid]).toEqual([]);
    expect(state.outboundReceiptByMessageId[serverMsg.id]).toBe('sent');
    expect(state.outboundReceiptByMessageId[optimisticId]).toBeUndefined();
  });

  it('replaceOptimisticMessage keeps plaintext when server ack body is E2EE envelope', async () => {
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
    const state = messagingReducer(
      {
        ...base,
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
      replaceOptimisticMessage({
        conversationId: cid,
        optimisticId,
        message: serverMsg,
      }),
    );
    expect(state.messagesById[serverMsg.id]?.body).toBe(plain);
    expect(state.senderPlaintextByMessageId[serverMsg.id]).toBe(plain);
  });

  it('appendIncomingMessageIfNew keeps senderPlaintext when server body is E2EE and optimistic had plaintext', async () => {
    const optimisticId = 'client:ffffffff-ffff-ffff-ffff-ffffffffffff';
    const plain = 'Hello via message:new';
    const pair = await generateP256EcdhKeyPair();
    const subtle = globalThis.crypto.subtle;
    const spkiDer = await subtle.exportKey('spki', pair.publicKey);
    const recipientSpkiB64 = arrayBufferToBase64(spkiDer);
    const wire = await encryptUtf8ToE2eeBody(plain, recipientSpkiB64);

    let state = messagingReducer(
      base,
      appendMessageFromSend({
        conversationId: cid,
        message: {
          id: optimisticId,
          conversationId: cid,
          senderId: userId,
          body: plain,
          mediaKey: null,
          createdAt: new Date().toISOString(),
        },
      }),
    );
    const serverMsg: Message = {
      id: 'm-new-socket',
      conversationId: cid,
      senderId: userId,
      body: wire,
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };
    state = messagingReducer(
      state,
      appendIncomingMessageIfNew({ message: serverMsg, currentUserId: userId }),
    );
    expect(state.messagesById[serverMsg.id]?.body).toBe(plain);
    expect(state.senderPlaintextByMessageId[serverMsg.id]).toBe(plain);
  });

  it('appendIncomingMessageIfNew reconciles optimistic when client id is missing from id list (stale list)', async () => {
    const optimisticId = 'client:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const plain = 'Stale list fix';
    const pair = await generateP256EcdhKeyPair();
    const subtle = globalThis.crypto.subtle;
    const spkiDer = await subtle.exportKey('spki', pair.publicKey);
    const recipientSpkiB64 = arrayBufferToBase64(spkiDer);
    const wire = await encryptUtf8ToE2eeBody(plain, recipientSpkiB64);

    const serverMsg: Message = {
      id: 'm-stale',
      conversationId: cid,
      senderId: userId,
      body: wire,
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };

    const state = messagingReducer(
      {
        ...base,
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
        messageIdsByConversationId: { [cid]: [] },
        pendingOutgoingClientIdsByConversationId: { [cid]: [optimisticId] },
      },
      appendIncomingMessageIfNew({ message: serverMsg, currentUserId: userId }),
    );

    expect(state.messagesById[serverMsg.id]?.body).toBe(plain);
    expect(state.senderPlaintextByMessageId[serverMsg.id]).toBe(plain);
    expect(state.messageIdsByConversationId[cid]).toEqual([serverMsg.id]);
    expect(state.messagesById[optimisticId]).toBeUndefined();
  });

  it('appendIncomingMessageIfNew replaces FIFO client id when message:new arrives before ack', () => {
    const optimisticId = 'client:22222222-2222-2222-2222-222222222222';
    const optimistic: Message = {
      id: optimisticId,
      conversationId: cid,
      senderId: userId,
      body: 'hi',
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };
    let state = messagingReducer(
      base,
      appendMessageFromSend({ conversationId: cid, message: optimistic }),
    );
    const serverMsg: Message = {
      id: 'm-real',
      conversationId: cid,
      senderId: userId,
      body: 'cipher',
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };
    state = messagingReducer(
      state,
      appendIncomingMessageIfNew({ message: serverMsg, currentUserId: userId }),
    );
    expect(state.messageIdsByConversationId[cid]).toEqual([serverMsg.id]);
    expect(state.messagesById[optimisticId]).toBeUndefined();
    expect(state.messagesById[serverMsg.id]).toEqual(serverMsg);
    expect(state.pendingOutgoingClientIdsByConversationId[cid]).toEqual([]);
    expect(state.outboundReceiptByMessageId['m-real']).toBe('sent');
  });

  it('mergeReceiptFanoutFromSocket records peer delivered/seen in receiptsByMessageId', () => {
    const mid = 'msg-1';
    const peer = 'user-b';
    const at = '2026-01-01T00:00:00.000Z';
    let state = messagingReducer(
      {
        ...base,
        messagesById: {
          [mid]: {
            id: mid,
            conversationId: cid,
            senderId: userId,
            body: 'x',
            mediaKey: null,
            createdAt: new Date().toISOString(),
          },
        },
        outboundReceiptByMessageId: { [mid]: 'sent' },
      },
      mergeReceiptFanoutFromSocket({
        messageId: mid,
        conversationId: cid,
        actorUserId: peer,
        at,
        kind: 'delivered',
      }),
    );
    expect(state.receiptsByMessageId[mid]?.receiptsByUserId?.[peer]?.deliveredAt).toBe(at);
    expect(
      selectOutboundReceiptTickState(state, mid, userId, {
        kind: 'direct',
        peerUserId: peer,
      }),
    ).toBe('delivered');

    state = messagingReducer(
      state,
      mergeReceiptFanoutFromSocket({
        messageId: mid,
        conversationId: cid,
        actorUserId: peer,
        at,
        kind: 'seen',
      }),
    );
    expect(state.receiptsByMessageId[mid]?.receiptsByUserId?.[peer]?.seenAt).toBe(at);
    expect(
      selectOutboundReceiptTickState(state, mid, userId, {
        kind: 'direct',
        peerUserId: peer,
      }),
    ).toBe('seen');
  });

  it('mergeReceiptFanoutFromSocket merges receipts for any message; tick selector is unknown when viewer is not the sender', () => {
    const mid = 'msg-peer';
    const peer = 'user-b';
    const at = '2026-01-01T00:00:00.000Z';
    const state = messagingReducer(
      {
        ...base,
        messagesById: {
          [mid]: {
            id: mid,
            conversationId: cid,
            senderId: 'other',
            body: 'x',
            mediaKey: null,
            createdAt: new Date().toISOString(),
          },
        },
        outboundReceiptByMessageId: {},
      },
      mergeReceiptFanoutFromSocket({
        messageId: mid,
        conversationId: cid,
        actorUserId: peer,
        at,
        kind: 'delivered',
      }),
    );
    expect(state.receiptsByMessageId[mid]?.receiptsByUserId?.[peer]?.deliveredAt).toBe(at);
    expect(
      selectOutboundReceiptTickState(state, mid, userId, {
        kind: 'direct',
        peerUserId: peer,
      }),
    ).toBe('unknown');
  });
});

describe('hydrateSenderPlaintextFromDisk', () => {
  it('merges persisted map into senderPlaintextByMessageId', () => {
    const state = messagingReducer(
      base,
      hydrateSenderPlaintextFromDisk({ 'm-1': 'hello', 'm-2': 'world' }),
    );
    expect(state.senderPlaintextByMessageId).toEqual({
      'm-1': 'hello',
      'm-2': 'world',
    });
  });

  it('overlays E2EE wire body in hydrateMessagesFromFetch when plaintext is present', async () => {
    const cid = 'conv-1';
    const userId = 'user-self';
    const plain = 'Hi there';
    const pair = await generateP256EcdhKeyPair();
    const subtle = globalThis.crypto.subtle;
    const spkiDer = await subtle.exportKey('spki', pair.publicKey);
    const recipientSpkiB64 = arrayBufferToBase64(spkiDer);
    const wire = await encryptUtf8ToE2eeBody(plain, recipientSpkiB64);
    const msg: Message = {
      id: 'm-e2ee',
      conversationId: cid,
      senderId: userId,
      body: wire,
      mediaKey: null,
      createdAt: new Date().toISOString(),
    };
    let state = messagingReducer(
      base,
      hydrateSenderPlaintextFromDisk({ [msg.id]: plain }),
    );
    state = messagingReducer(
      state,
      hydrateMessagesFromFetch({
        conversationId: cid,
        messages: [msg],
        currentUserId: userId,
      }),
    );
    expect(state.messagesById[msg.id]?.body).toBe(plain);
  });
});
