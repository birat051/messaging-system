import { describe, expect, it } from 'vitest';
import {
  buildMessageKindNotificationPayload,
  buildMessagePreview,
} from './messageNotification.js';
import type { MessageApiPayload } from '../messages/messageApiShape.js';

const sampleMessage: MessageApiPayload = {
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'user-a',
  body: 'Hello world',
  mediaKey: null,
  createdAt: '2026-04-01T12:00:00.000Z',
};

describe('messageNotification', () => {
  it('buildMessagePreview truncates long body', () => {
    const long = 'x'.repeat(200);
    const p = buildMessagePreview(long, null);
    expect(p).toHaveLength(160);
    expect(p?.endsWith('…')).toBe(true);
  });

  it('buildMessagePreview uses Attachment label for media-only', () => {
    expect(buildMessagePreview(null, 's3://key')).toBe('Attachment');
  });

  it('buildMessageKindNotificationPayload matches direct thread shape', () => {
    const n = buildMessageKindNotificationPayload(sampleMessage, 'Alice', {
      threadType: 'direct',
    });
    expect(n.schemaVersion).toBe(1);
    expect(n.kind).toBe('message');
    expect(n.threadType).toBe('direct');
    expect(n.conversationId).toBe('conv-1');
    expect(n.messageId).toBe('msg-1');
    expect(n.senderUserId).toBe('user-a');
    expect(n.senderDisplayName).toBe('Alice');
    expect(n.preview).toBe('Hello world');
    expect(n.groupId).toBeUndefined();
  });

  it('buildMessageKindNotificationPayload includes group fields for group threads', () => {
    const n = buildMessageKindNotificationPayload(sampleMessage, null, {
      threadType: 'group',
      groupId: 'grp-9',
      groupTitle: 'Team',
    });
    expect(n.threadType).toBe('group');
    expect(n.groupId).toBe('grp-9');
    expect(n.groupTitle).toBe('Team');
  });
});
