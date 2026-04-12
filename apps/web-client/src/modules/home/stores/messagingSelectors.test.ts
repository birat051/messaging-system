import { describe, expect, it } from 'vitest';
import type { MessagingState } from './messagingSlice';
import {
  selectOutboundReceiptDisplay,
  selectOutboundReceiptTickForMessage,
  selectOutboundReceiptTickState,
} from './messagingSelectors';
import type { RootState } from '@/store/store';

describe('selectOutboundReceiptTickState (direct)', () => {
  const userId = 'me';
  const peerId = 'peer';

  it('returns sent for own server message without receipt entry', () => {
    const messaging: MessagingState = {
      activeConversationId: null,
      messagesById: {
        m1: {
          id: 'm1',
          conversationId: 'c1',
          senderId: userId,
          body: 'hi',
          mediaKey: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
      messageIdsByConversationId: {},
      pendingOutgoingClientIdsByConversationId: {},
      outboundReceiptByMessageId: { m1: 'sent' },
      receiptsByMessageId: {},
      sendPendingByConversationId: {},
      sendErrorByConversationId: {},
    };
    expect(
      selectOutboundReceiptTickState(messaging, 'm1', userId, {
        kind: 'direct',
        peerUserId: peerId,
      }),
    ).toBe('sent');
  });

  it('createSelector wrapper matches plain function', () => {
    const messaging: MessagingState = {
      activeConversationId: null,
      messagesById: {
        m1: {
          id: 'm1',
          conversationId: 'c1',
          senderId: userId,
          body: 'hi',
          mediaKey: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
      messageIdsByConversationId: {},
      pendingOutgoingClientIdsByConversationId: {},
      outboundReceiptByMessageId: { m1: 'sent' },
      receiptsByMessageId: {
        m1: {
          messageId: 'm1',
          conversationId: 'c1',
          createdAt: '2026-01-01T00:00:00.000Z',
          receiptsByUserId: { [peerId]: { seenAt: '2026-01-02T00:00:00.000Z' } },
        },
      },
      sendPendingByConversationId: {},
      sendErrorByConversationId: {},
    };
    const root = { messaging } as RootState;
    const ctx = { kind: 'direct' as const, peerUserId: peerId };
    expect(selectOutboundReceiptTickForMessage(root, 'm1', userId, ctx)).toBe('seen');
    expect(selectOutboundReceiptTickState(messaging, 'm1', userId, ctx)).toBe('seen');
  });
});

describe('selectOutboundReceiptDisplay (group aggregate)', () => {
  const userId = 'me';
  const a = 'user-a';
  const b = 'user-b';
  const c = 'user-c';

  const baseMessaging = (): MessagingState => ({
    activeConversationId: null,
    messagesById: {
      m1: {
        id: 'm1',
        conversationId: 'c1',
        senderId: userId,
        body: 'hi',
        mediaKey: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    },
    messageIdsByConversationId: {},
    pendingOutgoingClientIdsByConversationId: {},
    outboundReceiptByMessageId: { m1: 'sent' },
    receiptsByMessageId: {},
    sendPendingByConversationId: {},
    sendErrorByConversationId: {},
  });

  it('shows sent until all recipients have delivered', () => {
    const messaging = baseMessaging();
    messaging.receiptsByMessageId.m1 = {
      messageId: 'm1',
      conversationId: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      receiptsByUserId: {
        [a]: { deliveredAt: '2026-01-02T00:00:00.000Z' },
      },
    };
    const d = selectOutboundReceiptDisplay(messaging, 'm1', userId, {
      kind: 'group',
      recipientUserIds: [a, b, c],
    });
    expect(d.state).toBe('sent');
    expect(d.groupProgress).toEqual({ delivered: 1, seen: 0, total: 3 });
    expect(d.groupSubtitle).toBe('1/3 delivered');
  });

  it('shows delivered when all have delivered but not all read', () => {
    const messaging = baseMessaging();
    messaging.receiptsByMessageId.m1 = {
      messageId: 'm1',
      conversationId: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      receiptsByUserId: {
        [a]: { deliveredAt: '2026-01-02T00:00:00.000Z' },
        [b]: { deliveredAt: '2026-01-02T00:00:00.000Z' },
        [c]: { deliveredAt: '2026-01-02T00:00:00.000Z' },
      },
    };
    const d = selectOutboundReceiptDisplay(messaging, 'm1', userId, {
      kind: 'group',
      recipientUserIds: [a, b, c],
    });
    expect(d.state).toBe('delivered');
    expect(d.groupSubtitle).toBe('0/3 read');
  });

  it('shows seen when every recipient has seenAt', () => {
    const messaging = baseMessaging();
    messaging.receiptsByMessageId.m1 = {
      messageId: 'm1',
      conversationId: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      receiptsByUserId: {
        [a]: { deliveredAt: '2026-01-02T00:00:00.000Z', seenAt: '2026-01-03T00:00:00.000Z' },
        [b]: { deliveredAt: '2026-01-02T00:00:00.000Z', seenAt: '2026-01-03T00:00:00.000Z' },
        [c]: { deliveredAt: '2026-01-02T00:00:00.000Z', seenAt: '2026-01-03T00:00:00.000Z' },
      },
    };
    const d = selectOutboundReceiptDisplay(messaging, 'm1', userId, {
      kind: 'group',
      recipientUserIds: [a, b, c],
    });
    expect(d.state).toBe('seen');
    expect(d.groupSubtitle).toBeNull();
  });
});
