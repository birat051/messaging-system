import { describe, expect, it } from 'vitest';
import { parseNotificationWorkerPayload } from './socketNotificationPayload';

describe('parseNotificationWorkerPayload', () => {
  it('accepts kind message (direct)', () => {
    const raw = {
      schemaVersion: 1,
      kind: 'message',
      notificationId: 'n1',
      occurredAt: '2026-04-12T12:00:00.000Z',
      threadType: 'direct',
      conversationId: 'c1',
      messageId: 'm1',
      senderUserId: 'u1',
      senderDisplayName: 'A',
      preview: 'hi',
    };
    const out = parseNotificationWorkerPayload(raw);
    expect(out).toEqual(raw);
  });

  it('accepts kind message (group)', () => {
    const raw = {
      schemaVersion: 1,
      kind: 'message',
      notificationId: 'n2',
      occurredAt: '2026-04-12T12:00:00.000Z',
      threadType: 'group',
      conversationId: 'c2',
      messageId: 'm2',
      senderUserId: 'u2',
      groupId: 'g1',
      groupTitle: 'Team',
    };
    expect(parseNotificationWorkerPayload(raw)).toEqual(raw);
  });

  it('accepts kind call_incoming (direct)', () => {
    const raw = {
      schemaVersion: 1,
      kind: 'call_incoming',
      notificationId: 'n3',
      occurredAt: '2026-04-12T12:00:00.000Z',
      media: 'video',
      callScope: 'direct',
      callId: 'call-id-12345678',
      callerUserId: 'peer',
      callerDisplayName: 'Pat',
      conversationId: 'conv1',
    };
    expect(parseNotificationWorkerPayload(raw)).toEqual(raw);
  });

  it('rejects group message without groupId', () => {
    expect(
      parseNotificationWorkerPayload({
        schemaVersion: 1,
        kind: 'message',
        notificationId: 'n',
        occurredAt: '2026-01-01T00:00:00.000Z',
        threadType: 'group',
        conversationId: 'c',
        messageId: 'm',
        senderUserId: 'u',
      }),
    ).toBeNull();
  });

  it('rejects unknown kind', () => {
    expect(
      parseNotificationWorkerPayload({
        schemaVersion: 1,
        kind: 'other',
        notificationId: 'n',
      }),
    ).toBeNull();
  });

  it('rejects wrong schemaVersion', () => {
    expect(
      parseNotificationWorkerPayload({
        schemaVersion: 2,
        kind: 'message',
        notificationId: 'n',
        occurredAt: '2026-01-01T00:00:00.000Z',
        threadType: 'direct',
        conversationId: 'c',
        messageId: 'm',
        senderUserId: 'u',
      }),
    ).toBeNull();
  });
});
