import { describe, expect, it } from 'vitest';
import {
  isMessageWireE2ee,
  MESSAGE_HYBRID_ALGORITHM,
} from '@/common/crypto/messageHybrid';
import {
  PEER_DECRYPT_INLINE_UNAVAILABLE,
  PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
} from '@/modules/home/utils/peerDecryptInline';
import { resolveMessageDisplayBody } from './messageDisplayBody';
import type { Message } from '@/modules/home/stores/messagingSlice';

function msg(p: Partial<Message> & Pick<Message, 'id'>): Message {
  return {
    conversationId: 'c1',
    senderId: 'u1',
    body: null,
    mediaKey: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

describe('resolveMessageDisplayBody', () => {
  it('returns raw body for non-E2EE messages', () => {
    const m = msg({ id: 'm1', body: 'hello' });
    expect(
      resolveMessageDisplayBody(m, true, {}, {}),
    ).toBe('hello');
  });

  const hybridWire = {
    body: 'Ym9keQ==',
    iv: 'aXZpdjEyNDU2Nzg5',
    algorithm: MESSAGE_HYBRID_ALGORITHM,
    encryptedMessageKeys: { dev1: '{}' },
  };

  it('uses sender plaintext overlay for own hybrid bodies', () => {
    const m = msg({ id: 'm1', ...hybridWire });
    expect(
      resolveMessageDisplayBody(m, true, { m1: 'Hi' }, {}),
    ).toBe('Hi');
  });

  it('uses senderPlaintextByMessageId for own hybrid when keyed by server message id (wire body unchanged)', () => {
    const m = msg({
      id: 'msg-persisted-abc',
      ...hybridWire,
    });
    const plain = 'Typed before send; same id after message:send ack';
    expect(
      resolveMessageDisplayBody(m, true, { 'msg-persisted-abc': plain }, {}),
    ).toBe(plain);
  });

  it('for own hybrid shows ellipsis when sender plaintext map is empty (never wire from MongoDB)', () => {
    const m = msg({ id: 'm1', ...hybridWire });
    expect(resolveMessageDisplayBody(m, true, {}, {})).toBe('\u2026');
  });

  it('uses decrypted map for peer hybrid bodies', () => {
    const m = msg({ id: 'm1', ...hybridWire });
    expect(
      resolveMessageDisplayBody(m, false, {}, { m1: 'Peer hi' }),
    ).toBe('Peer hi');
  });

  it('shows ellipsis while peer hybrid decrypt is pending', () => {
    const m = msg({ id: 'm1', ...hybridWire });
    expect(resolveMessageDisplayBody(m, false, {}, {})).toBe('\u2026');
  });

  it('treats hybrid E2EE (body + iv + map + algorithm) as ciphertext until overlay', () => {
    const m = msg({
      id: 'm1',
      body: 'Ym9keQ==',
      iv: 'aXZpdjEyNDU2Nzg5',
      algorithm: MESSAGE_HYBRID_ALGORITHM,
      encryptedMessageKeys: { dev1: '{}' },
    });
    expect(resolveMessageDisplayBody(m, false, {}, {})).toBe('\u2026');
    expect(
      resolveMessageDisplayBody(m, false, {}, { m1: 'Decrypted' }),
    ).toBe('Decrypted');
  });

  it('shows peer decrypt inline copy when decrypt overlay is missing wrapped key for myDeviceId (usePeerMessageDecryption)', () => {
    const m = msg({
      id: 'm1',
      body: 'Ym9keQ==',
      iv: 'aXZpdjEyNDU2Nzg5',
      algorithm: MESSAGE_HYBRID_ALGORITHM,
      encryptedMessageKeys: { 'other-device': '{}' },
    });
    expect(
      resolveMessageDisplayBody(m, false, {}, { m1: PEER_DECRYPT_NO_DEVICE_KEY_ENTRY }),
    ).toBe(PEER_DECRYPT_NO_DEVICE_KEY_ENTRY);
    expect(PEER_DECRYPT_NO_DEVICE_KEY_ENTRY).not.toBe(PEER_DECRYPT_INLINE_UNAVAILABLE);
  });

  it('Feature 11 (B): peer bubble shows unavailable copy, not raw base64, when not wire-classified', () => {
    const raw = 'aCbkLLXatRIo1p/5ZKMu4Fe0';
    const m = msg({ id: 'm1', body: raw });
    expect(isMessageWireE2ee(m)).toBe(false);
    expect(resolveMessageDisplayBody(m, false, {}, {})).toBe(
      PEER_DECRYPT_INLINE_UNAVAILABLE,
    );
  });

  it('Feature 11 (B): own row shows ellipsis for unclassified opaque body (never ciphertext)', () => {
    const raw = 'aCbkLLXatRIo1p/5ZKMu4Fe0';
    const m = msg({ id: 'm1', body: raw });
    expect(resolveMessageDisplayBody(m, true, {}, {})).toBe('\u2026');
  });

  it('incomplete hybrid (empty encryptedMessageKeys): peer sees Feature 11 (B) copy, not raw body', () => {
    const opaqueBody = 'Ym9keVNhbXBsZUJpZ0Jhc2U2NA==';
    const m = msg({
      id: 'm1',
      body: opaqueBody,
      iv: 'aXZpdjEyNDU2Nzg5',
      algorithm: MESSAGE_HYBRID_ALGORITHM,
      encryptedMessageKeys: {},
    });
    expect(isMessageWireE2ee(m)).toBe(false);
    expect(resolveMessageDisplayBody(m, false, {}, {})).toBe(
      PEER_DECRYPT_INLINE_UNAVAILABLE,
    );
  });
});
