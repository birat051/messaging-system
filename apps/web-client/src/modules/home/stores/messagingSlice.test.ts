import { describe, expect, it } from 'vitest';
import {
  encryptUtf8ToHybridSendPayload,
  mergeHybridDeviceRows,
} from '@/common/crypto/messageHybrid';
import { exportPublicKeySpkiBase64, generateP256EcdhKeyPair } from '@/common/crypto/keypair';
import type { components } from '@/generated/api-types';
import {
  appendIncomingMessageIfNew,
  appendMessageFromSend,
  clearConversationScrollTarget,
  hydrateMessagesFromFetch,
  hydrateSenderPlaintextFromDisk,
  mergeReceiptFanoutFromSocket,
  messagingReducer,
  recordOwnSendPlaintext,
  replaceOptimisticMessage,
  setActiveConversationId,
  setConversationScrollTarget,
} from './messagingSlice';
import {
  selectOutboundReceiptTickState,
  selectScrollTargetConversationId,
  selectScrollTargetMessageId,
  selectScrollTargetNonce,
  selectScrollTargetReason,
} from './messagingSelectors';

type Message = components['schemas']['Message'];

async function hybridWireFromPlaintext(plain: string) {
  const pair = await generateP256EcdhKeyPair();
  const spki = await exportPublicKeySpkiBase64(pair.publicKey);
  const devices = mergeHybridDeviceRows([
    { deviceId: 'slice-wire-dev', publicKey: spki },
  ]);
  return encryptUtf8ToHybridSendPayload(plain, devices);
}

const base = {
  activeConversationId: null,
  pendingDirectPeer: null,
  messagesById: {} as Record<string, Message>,
  messageIdsByConversationId: {} as Record<string, string[]>,
  pendingOutgoingClientIdsByConversationId: {} as Record<string, string[]>,
  outboundReceiptByMessageId: {} as Record<string, 'loading' | 'sent' | 'delivered' | 'seen'>,
  receiptsByMessageId: {} as Record<string, components['schemas']['MessageReceiptSummary']>,
  sendPendingByConversationId: {},
  sendErrorByConversationId: {},
  senderPlaintextByMessageId: {},
  decryptedBodyByMessageId: {},
  decryptedAttachmentKeyByMessageId: {},
  decryptedAttachmentUrlByMessageId: {},
  scrollTargetMessageId: null,
  scrollTargetConversationId: null,
  scrollTargetReason: null,
  scrollTargetNonce: 0,
};

describe('setActiveConversationId (§6 open thread)', () => {
  it('bumps scrollTargetNonce when opening the conversation that matches pending scroll target', () => {
    const cid = 'conv-open';
    const state = messagingReducer(
      {
        ...base,
        activeConversationId: 'conv-other',
        scrollTargetMessageId: 'm-1',
        scrollTargetConversationId: cid,
        scrollTargetReason: 'message_new',
        scrollTargetNonce: 4,
      },
      setActiveConversationId(cid),
    );
    expect(state.activeConversationId).toBe(cid);
    expect(state.scrollTargetNonce).toBe(5);
    expect(state.scrollTargetMessageId).toBe('m-1');
  });

  it('does not bump scrollTargetNonce when opening a different conversation than scroll target', () => {
    const state = messagingReducer(
      {
        ...base,
        activeConversationId: null,
        scrollTargetMessageId: 'm-1',
        scrollTargetConversationId: 'conv-b',
        scrollTargetNonce: 2,
      },
      setActiveConversationId('conv-a'),
    );
    expect(state.activeConversationId).toBe('conv-a');
    expect(state.scrollTargetNonce).toBe(2);
  });

  it('does not bump scrollTargetNonce when pending target has no message id', () => {
    const cid = 'conv-only';
    const state = messagingReducer(
      {
        ...base,
        scrollTargetMessageId: null,
        scrollTargetConversationId: cid,
        scrollTargetNonce: 7,
      },
      setActiveConversationId(cid),
    );
    expect(state.scrollTargetNonce).toBe(7);
  });
});

describe('recordOwnSendPlaintext', () => {
  it('stores plaintext for first-DM send when there was no optimistic client id', () => {
    const state = messagingReducer(
      base,
      recordOwnSendPlaintext({
        messageId: 'msg-server-1',
        plaintext: 'Hello new thread',
      }),
    );
    expect(state.senderPlaintextByMessageId['msg-server-1']).toBe('Hello new thread');
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

  it('replaceOptimisticMessage keeps plaintext when server ack body is hybrid wire', async () => {
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

  it('replaceOptimisticMessage preserves mediaPreviewUrl from optimistic StoredMessage', () => {
    const optimisticId = 'client:media-1111-1111-1111-111111111111';
    const preview = 'blob:mock-preview';
    const serverMsg: Message = {
      id: 'm-with-key',
      conversationId: cid,
      senderId: userId,
      body: null,
      mediaKey: 'users/x/photo.png',
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
            body: null,
            mediaKey: 'users/x/photo.png',
            mediaPreviewUrl: preview,
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
    expect(state.messagesById[serverMsg.id]?.mediaKey).toBe('users/x/photo.png');
    expect(
      (state.messagesById[serverMsg.id] as { mediaPreviewUrl?: string })
        .mediaPreviewUrl,
    ).toBe(preview);
  });

  it('appendIncomingMessageIfNew preserves mediaPreviewUrl when reconciling optimistic', () => {
    const optimisticId = 'client:media-2222-2222-2222-222222222222';
    const preview = 'https://api.example/presigned';
    let state = messagingReducer(
      base,
      appendMessageFromSend({
        conversationId: cid,
        message: {
          id: optimisticId,
          conversationId: cid,
          senderId: userId,
          body: null,
          mediaKey: 'k/image.png',
          mediaPreviewUrl: preview,
          createdAt: new Date().toISOString(),
        },
      }),
    );
    const serverMsg: Message = {
      id: 'm-srv-media',
      conversationId: cid,
      senderId: userId,
      body: null,
      mediaKey: 'k/image.png',
      createdAt: new Date().toISOString(),
    };
    state = messagingReducer(
      state,
      appendIncomingMessageIfNew({ message: serverMsg, currentUserId: userId }),
    );
    expect(
      (state.messagesById[serverMsg.id] as { mediaPreviewUrl?: string })
        .mediaPreviewUrl,
    ).toBe(preview);
  });

  it('appendIncomingMessageIfNew keeps senderPlaintext when server body is hybrid and optimistic had plaintext', async () => {
    const optimisticId = 'client:ffffffff-ffff-ffff-ffff-ffffffffffff';
    const plain = 'Hello via message:new';
    const hybrid = await hybridWireFromPlaintext(plain);

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
      body: hybrid.body,
      iv: hybrid.iv,
      algorithm: hybrid.algorithm,
      encryptedMessageKeys: hybrid.encryptedMessageKeys,
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
    const hybrid = await hybridWireFromPlaintext(plain);

    const serverMsg: Message = {
      id: 'm-stale',
      conversationId: cid,
      senderId: userId,
      body: hybrid.body,
      iv: hybrid.iv,
      algorithm: hybrid.algorithm,
      encryptedMessageKeys: hybrid.encryptedMessageKeys,
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

  it('overlays hybrid wire body in hydrateMessagesFromFetch when plaintext is present', async () => {
    const cid = 'conv-1';
    const userId = 'user-self';
    const plain = 'Hi there';
    const hybrid = await hybridWireFromPlaintext(plain);
    const msg: Message = {
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

describe('conversation scroll target (§6)', () => {
  it('setConversationScrollTarget overwrites previous target and bumps nonce', () => {
    let state = messagingReducer(
      base,
      setConversationScrollTarget({
        messageId: 'm1',
        conversationId: 'c1',
        reason: 'message_new',
      }),
    );
    expect(state.scrollTargetMessageId).toBe('m1');
    expect(state.scrollTargetConversationId).toBe('c1');
    expect(state.scrollTargetReason).toBe('message_new');
    expect(state.scrollTargetNonce).toBe(1);

    state = messagingReducer(
      state,
      setConversationScrollTarget({
        messageId: 'm2',
        conversationId: 'c2',
        reason: 'send_ack',
      }),
    );
    expect(state.scrollTargetMessageId).toBe('m2');
    expect(state.scrollTargetConversationId).toBe('c2');
    expect(state.scrollTargetReason).toBe('send_ack');
    expect(state.scrollTargetNonce).toBe(2);
  });

  it('clearConversationScrollTarget is a no-op when already clear', () => {
    const state = messagingReducer(base, clearConversationScrollTarget());
    expect(state.scrollTargetMessageId).toBeNull();
    expect(state.scrollTargetConversationId).toBeNull();
    expect(state.scrollTargetReason).toBeNull();
    expect(state.scrollTargetNonce).toBe(0);
  });

  it('clearConversationScrollTarget clears after set', () => {
    let state = messagingReducer(
      base,
      setConversationScrollTarget({ messageId: 'm1', conversationId: 'c1' }),
    );
    state = messagingReducer(state, clearConversationScrollTarget());
    expect(state.scrollTargetMessageId).toBeNull();
    expect(state.scrollTargetConversationId).toBeNull();
    expect(state.scrollTargetReason).toBeNull();
    expect(state.scrollTargetNonce).toBe(1);
  });

  it('trims messageId and conversationId', () => {
    const state = messagingReducer(
      base,
      setConversationScrollTarget({
        messageId: '  mid  ',
        conversationId: '  cid  ',
        reason: 'open_thread',
      }),
    );
    expect(state.scrollTargetMessageId).toBe('mid');
    expect(state.scrollTargetConversationId).toBe('cid');
    expect(state.scrollTargetReason).toBe('open_thread');
  });

  it('ignores set when messageId or conversationId is blank after trim', () => {
    const state = messagingReducer(
      base,
      setConversationScrollTarget({ messageId: '', conversationId: 'c1' }),
    );
    expect(state.scrollTargetMessageId).toBeNull();
    expect(state.scrollTargetNonce).toBe(0);
  });
});

describe('selectors — scroll target', () => {
  it('reads scroll target from RootState', async () => {
    const { createTestStore } = await import('@/common/test-utils');
    const store = createTestStore();
    store.dispatch(
      setConversationScrollTarget({
        messageId: 'row-9',
        conversationId: 'conv-z',
        reason: 'message_new',
      }),
    );
    const s = store.getState();
    expect(selectScrollTargetMessageId(s)).toBe('row-9');
    expect(selectScrollTargetConversationId(s)).toBe('conv-z');
    expect(selectScrollTargetReason(s)).toBe('message_new');
    expect(selectScrollTargetNonce(s)).toBe(1);
  });
});
