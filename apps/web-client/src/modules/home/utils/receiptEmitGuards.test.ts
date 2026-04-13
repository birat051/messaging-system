import { describe, expect, it } from 'vitest';
import {
  currentUserHasSeenMessage,
  hydratePeerReadDedupeFromReceipts,
} from './receiptEmitGuards';

describe('currentUserHasSeenMessage', () => {
  const uid = 'user-self';

  it('returns false when there is no receipt for the message', () => {
    expect(currentUserHasSeenMessage({}, 'm1', uid)).toBe(false);
  });

  it('returns false when receipts exist but current user has no seenAt', () => {
    expect(
      currentUserHasSeenMessage(
        {
          m1: {
            messageId: 'm1',
            conversationId: 'c1',
            createdAt: '2026-01-01T00:00:00.000Z',
            receiptsByUserId: { peer: { deliveredAt: '2026-01-01T00:00:01.000Z' } },
          },
        },
        'm1',
        uid,
      ),
    ).toBe(false);
  });

  it('returns true when current user has seenAt', () => {
    expect(
      currentUserHasSeenMessage(
        {
          m1: {
            messageId: 'm1',
            conversationId: 'c1',
            createdAt: '2026-01-01T00:00:00.000Z',
            receiptsByUserId: {
              [uid]: { seenAt: '2026-01-01T00:00:02.000Z' },
            },
          },
        },
        'm1',
        uid,
      ),
    ).toBe(true);
  });
});

describe('hydratePeerReadDedupeFromReceipts', () => {
  const uid = 'user-self';
  const cid = 'conv-1';
  const receipt = (mid: string) => ({
    messageId: mid,
    conversationId: cid,
    createdAt: '2026-01-01T00:00:00.000Z',
    receiptsByUserId: {
      [uid]: { seenAt: '2026-01-01T00:00:02.000Z' },
    },
  });

  it('returns empty when activeConversationId is missing', () => {
    expect(
      hydratePeerReadDedupeFromReceipts({
        activeConversationId: null,
        messageIds: ['m1'],
        messagesById: {
          m1: {
            id: 'm1',
            conversationId: cid,
            senderId: 'peer',
            createdAt: '2026-01-01T00:00:00.000Z',
            body: '',
          },
        },
        receiptsByMessageId: { m1: receipt('m1') },
        currentUserId: uid,
      }),
    ).toEqual({
      peerMessageIdsSeen: [],
      conversationReadCursorKey: null,
    });
  });

  it('lists peer message ids already seen and sets conversation cursor when last is peer+seen', () => {
    expect(
      hydratePeerReadDedupeFromReceipts({
        activeConversationId: cid,
        messageIds: ['own1', 'peer1'],
        messagesById: {
          own1: {
            id: 'own1',
            conversationId: cid,
            senderId: uid,
            createdAt: '2026-01-01T00:00:00.000Z',
            body: '',
          },
          peer1: {
            id: 'peer1',
            conversationId: cid,
            senderId: 'peer',
            createdAt: '2026-01-01T00:00:01.000Z',
            body: '',
          },
        },
        receiptsByMessageId: { peer1: receipt('peer1') },
        currentUserId: uid,
      }),
    ).toEqual({
      peerMessageIdsSeen: ['peer1'],
      conversationReadCursorKey: `${cid}:peer1`,
    });
  });

  it('does not list own messages or set cursor when last message is own', () => {
    expect(
      hydratePeerReadDedupeFromReceipts({
        activeConversationId: cid,
        messageIds: ['peer1', 'own2'],
        messagesById: {
          peer1: {
            id: 'peer1',
            conversationId: cid,
            senderId: 'peer',
            createdAt: '2026-01-01T00:00:01.000Z',
            body: '',
          },
          own2: {
            id: 'own2',
            conversationId: cid,
            senderId: uid,
            createdAt: '2026-01-01T00:00:02.000Z',
            body: '',
          },
        },
        receiptsByMessageId: {
          peer1: receipt('peer1'),
          own2: receipt('own2'),
        },
        currentUserId: uid,
      }),
    ).toEqual({
      peerMessageIdsSeen: ['peer1'],
      conversationReadCursorKey: null,
    });
  });
});
