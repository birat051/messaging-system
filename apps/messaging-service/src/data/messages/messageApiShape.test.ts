import { describe, expect, it } from 'vitest';
import { messageDocumentToApi } from './messageApiShape.js';
import type { MessageDocument } from './messages.collection.js';

describe('messageDocumentToApi', () => {
  it('round-trips mediaKey for attachment rows (REST + Socket.IO message:new)', () => {
    const doc: MessageDocument = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      conversationId: 'conv-1',
      senderId: 'user-a',
      body: null,
      mediaKey: 'users/user-a/11111111-1111-1111-1111-111111111111-photo.png',
      createdAt: new Date('2026-04-18T12:00:00.000Z'),
    };
    const api = messageDocumentToApi(doc);
    expect(api).toMatchObject({
      id: doc.id,
      conversationId: doc.conversationId,
      senderId: doc.senderId,
      body: null,
      mediaKey: doc.mediaKey,
      createdAt: doc.createdAt.toISOString(),
    });
    expect(api).not.toHaveProperty('attachments');
    expect(api).not.toHaveProperty('url');
  });
});
