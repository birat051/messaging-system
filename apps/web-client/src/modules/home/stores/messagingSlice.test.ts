import { describe, expect, it } from 'vitest';
import type { components } from '@/generated/api-types';
import {
  appendIncomingMessageIfNew,
  appendMessageFromSend,
  mergeReceiptFanoutFromSocket,
  messagingReducer,
  replaceOptimisticMessage,
} from './messagingSlice';
import { selectOutboundReceiptTickState } from './messagingSelectors';

type Message = components['schemas']['Message'];

const base = {
  activeConversationId: null,
  messagesById: {} as Record<string, Message>,
  messageIdsByConversationId: {} as Record<string, string[]>,
  pendingOutgoingClientIdsByConversationId: {} as Record<string, string[]>,
  outboundReceiptByMessageId: {} as Record<string, 'loading' | 'sent' | 'delivered' | 'seen'>,
  receiptsByMessageId: {} as Record<string, components['schemas']['MessageReceiptSummary']>,
  sendPendingByConversationId: {},
  sendErrorByConversationId: {},
};

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
