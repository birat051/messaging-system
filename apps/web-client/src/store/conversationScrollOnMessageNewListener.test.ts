import { describe, expect, it } from 'vitest';
import { createTestStore } from '@/common/test-utils';
import {
  appendIncomingMessageIfNew,
  appendMessageFromSend,
  replaceOptimisticMessage,
  setActiveConversationId,
} from '@/modules/home/stores/messagingSlice';
import type { Message } from '@/modules/home/stores/messagingSlice';
import {
  selectScrollTargetConversationId,
  selectScrollTargetMessageId,
  selectScrollTargetNonce,
  selectScrollTargetReason,
} from '@/modules/home/stores/messagingSelectors';

describe('conversationScrollOnMessageNewListener', () => {
  it('dispatches scroll target when appendIncomingMessageIfNew adds a new message', () => {
    const store = createTestStore();
    const msg = {
      id: 'm-new',
      conversationId: 'conv-a',
      senderId: 'peer',
      body: 'hi',
      mediaKey: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    store.dispatch(appendIncomingMessageIfNew({ message: msg, currentUserId: 'user-1' }));
    const s = store.getState();
    expect(selectScrollTargetMessageId(s)).toBe('m-new');
    expect(selectScrollTargetConversationId(s)).toBe('conv-a');
    expect(selectScrollTargetReason(s)).toBe('message_new');
    expect(selectScrollTargetNonce(s)).toBe(1);
  });

  it('does not bump scroll target when appendIncomingMessageIfNew is a dedupe no-op', () => {
    const store = createTestStore();
    const msg = {
      id: 'm-dup',
      conversationId: 'conv-a',
      senderId: 'peer',
      body: 'hi',
      mediaKey: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    store.dispatch(appendIncomingMessageIfNew({ message: msg, currentUserId: 'user-1' }));
    expect(selectScrollTargetNonce(store.getState())).toBe(1);

    store.dispatch(appendIncomingMessageIfNew({ message: msg, currentUserId: 'user-1' }));
    expect(selectScrollTargetNonce(store.getState())).toBe(1);
    expect(selectScrollTargetMessageId(store.getState())).toBe('m-dup');
  });

  it('sets scroll target even when activeConversationId is a different thread', () => {
    const store = createTestStore();
    store.dispatch(setActiveConversationId('conv-other'));
    const msg = {
      id: 'm-bg',
      conversationId: 'conv-a',
      senderId: 'peer',
      body: 'ping',
      mediaKey: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    store.dispatch(appendIncomingMessageIfNew({ message: msg, currentUserId: 'user-1' }));
    expect(store.getState().messaging.activeConversationId).toBe('conv-other');
    expect(selectScrollTargetConversationId(store.getState())).toBe('conv-a');
    expect(selectScrollTargetMessageId(store.getState())).toBe('m-bg');
  });

  it('dispatches send_ack scroll target when replaceOptimisticMessage runs', () => {
    const store = createTestStore();
    const cid = 'conv-send';
    const userId = 'user-a';
    const optimisticId = 'client:11111111-1111-1111-1111-111111111111';
    const optimistic: Message = {
      id: optimisticId,
      conversationId: cid,
      senderId: userId,
      body: 'x',
      mediaKey: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    store.dispatch(appendMessageFromSend({ conversationId: cid, message: optimistic }));
    const nonceAfterOptimistic = selectScrollTargetNonce(store.getState());

    const serverMsg: Message = {
      id: 'm-ack',
      conversationId: cid,
      senderId: userId,
      body: 'x',
      mediaKey: null,
      createdAt: '2026-01-01T00:00:01.000Z',
    };
    store.dispatch(
      replaceOptimisticMessage({
        conversationId: cid,
        optimisticId,
        message: serverMsg,
      }),
    );
    const s = store.getState();
    expect(selectScrollTargetMessageId(s)).toBe('m-ack');
    expect(selectScrollTargetConversationId(s)).toBe(cid);
    expect(selectScrollTargetReason(s)).toBe('send_ack');
    expect(selectScrollTargetNonce(s)).toBe(nonceAfterOptimistic + 1);
  });
});
