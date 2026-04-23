import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertMessage } from './repo.js';
import { CONVERSATIONS_COLLECTION } from '../../data/conversations/conversations.collection.js';
import { MESSAGES_COLLECTION } from './messages.collection.js';

const insertOneMock = vi.fn().mockResolvedValue({});
const updateOneMock = vi.fn().mockResolvedValue({ matchedCount: 1 });

vi.mock('../../data/db/mongo.js', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === MESSAGES_COLLECTION) {
        return { insertOne: insertOneMock };
      }
      if (name === CONVERSATIONS_COLLECTION) {
        return { updateOne: updateOneMock };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  }),
}));

describe('insertMessage — encryptedMessageKeys', () => {
  beforeEach(() => {
    insertOneMock.mockClear();
    updateOneMock.mockClear();
  });

  it('persists the full client encryptedMessageKeys map (no key stripping)', async () => {
    const emk = {
      'device-peer': 'wrap-peer',
      'device-sender-a': 'wrap-a',
      'device-sender-b': 'wrap-b',
    };

    await insertMessage({
      conversationId: 'conv-1',
      senderId: 'user-a',
      body: 'cipher',
      mediaKey: null,
      encryptedMessageKeys: emk,
      iv: 'iv-b64',
      algorithm: 'aes-256-gcm+p256-hybrid-v1',
    });

    expect(insertOneMock).toHaveBeenCalledTimes(1);
    const inserted = insertOneMock.mock.calls[0][0] as {
      encryptedMessageKeys?: Record<string, string>;
    };
    expect(inserted.encryptedMessageKeys).toEqual(emk);
    expect(Object.keys(inserted.encryptedMessageKeys ?? {})).toHaveLength(3);
  });
});
