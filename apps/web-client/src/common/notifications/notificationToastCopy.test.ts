import { describe, expect, it } from 'vitest';
import { formatInboundNotificationToast } from './notificationToastCopy';

describe('formatInboundNotificationToast', () => {
  it('formats kind message with preview', () => {
    expect(
      formatInboundNotificationToast({
        schemaVersion: 1,
        kind: 'message',
        notificationId: 'n1',
        occurredAt: '2026-01-01T00:00:00.000Z',
        threadType: 'direct',
        conversationId: 'c',
        messageId: 'm',
        senderUserId: 'u',
        senderDisplayName: 'Alex',
        preview: 'Hello',
      }),
    ).toBe('New message from Alex: Hello');
  });

  it('formats kind call_incoming', () => {
    expect(
      formatInboundNotificationToast({
        schemaVersion: 1,
        kind: 'call_incoming',
        notificationId: 'n2',
        occurredAt: '2026-01-01T00:00:00.000Z',
        media: 'video',
        callScope: 'direct',
        callId: 'call-id-12345678',
        callerUserId: 'p',
        callerDisplayName: 'Jordan',
      }),
    ).toBe('Incoming video call from Jordan');
  });
});
