import { describe, expect, it } from 'vitest';
import {
  conversationListAvatarInitials,
  lastMessagePreviewLine,
} from './conversationListPreview';
import { PEER_DECRYPT_NO_DEVICE_KEY_ENTRY } from './peerDecryptInline';

describe('conversationListAvatarInitials', () => {
  it('returns DM for default direct title', () => {
    expect(conversationListAvatarInitials('Direct message')).toBe('DM');
  });

  it('returns G for default group title', () => {
    expect(conversationListAvatarInitials('Group')).toBe('G');
  });

  it('uses first letters of two words', () => {
    expect(conversationListAvatarInitials('Ada Lovelace')).toBe('AL');
  });

  it('uses first two chars for single token', () => {
    expect(conversationListAvatarInitials('Ada')).toBe('AD');
  });
});

describe('lastMessagePreviewLine', () => {
  const emptyMaps = { senderPlaintextByMessageId: {}, decryptedBodyByMessageId: {} };

  it('returns body text when present', () => {
    const m = {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      body: 'Hello',
      createdAt: '2025-01-01T00:00:00.000Z',
      mediaKey: null,
    };
    expect(
      lastMessagePreviewLine(m, 'u2', emptyMaps.senderPlaintextByMessageId, emptyMaps.decryptedBodyByMessageId),
    ).toBe('Hello');
  });

  it('returns Attachment when body empty but mediaKey set', () => {
    const m = {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      body: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      mediaKey: 'users/u1/photo.png',
    };
    expect(
      lastMessagePreviewLine(m, 'u2', emptyMaps.senderPlaintextByMessageId, emptyMaps.decryptedBodyByMessageId),
    ).toBe('Attachment');
  });

  it('masks peer decrypt inline errors in the sidebar preview', () => {
    const m = {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'peer',
      body: 'cipher',
      algorithm: 'aes-256-gcm+p256-hybrid-v1',
      iv: 'aa',
      encryptedMessageKeys: { other: '{}' },
      createdAt: '2025-01-01T00:00:00.000Z',
      mediaKey: null,
    };
    const maps = {
      senderPlaintextByMessageId: {},
      decryptedBodyByMessageId: { m1: PEER_DECRYPT_NO_DEVICE_KEY_ENTRY },
    };
    expect(lastMessagePreviewLine(m, 'me', maps.senderPlaintextByMessageId, maps.decryptedBodyByMessageId)).toBe(
      'Encrypted message',
    );
  });
});
