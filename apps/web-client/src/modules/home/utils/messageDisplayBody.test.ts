import { describe, expect, it } from 'vitest';
import { E2EE_BODY_PREFIX } from '@/common/crypto/messageEcies';
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

  it('uses sender plaintext overlay for own E2EE bodies', () => {
    const wire = `${E2EE_BODY_PREFIX}{"v":1,"alg":"ecies-p256-hkdf-aes256gcm","ephPubSpkiB64":"eA","hkdfSaltB64":"cw","ivB64":"aXY","ciphertextB64":"Y3Q"}`;
    const m = msg({ id: 'm1', body: wire });
    expect(
      resolveMessageDisplayBody(m, true, { m1: 'Hi' }, {}),
    ).toBe('Hi');
  });

  it('uses senderPlaintextByMessageId for own E2EE when keyed by server message id (wire body unchanged)', () => {
    const wire = `${E2EE_BODY_PREFIX}{"v":1,"alg":"ecies-p256-hkdf-aes256gcm","ephPubSpkiB64":"eA","hkdfSaltB64":"cw","ivB64":"aXY","ciphertextB64":"Y3Q"}`;
    const m = msg({
      id: 'msg-persisted-abc',
      body: wire,
    });
    const plain = 'Typed before send; same id after message:send ack';
    expect(
      resolveMessageDisplayBody(m, true, { 'msg-persisted-abc': plain }, {}),
    ).toBe(plain);
  });

  it('for own E2EE shows ellipsis when sender plaintext map is empty (never wire from MongoDB)', () => {
    const wire = `${E2EE_BODY_PREFIX}{"v":1,"alg":"ecies-p256-hkdf-aes256gcm","ephPubSpkiB64":"eA","hkdfSaltB64":"cw","ivB64":"aXY","ciphertextB64":"Y3Q"}`;
    const m = msg({ id: 'm1', body: wire });
    expect(resolveMessageDisplayBody(m, true, {}, {})).toBe('\u2026');
  });

  it('uses decrypted map for peer E2EE bodies', () => {
    const wire = `${E2EE_BODY_PREFIX}{"v":1,"alg":"ecies-p256-hkdf-aes256gcm","ephPubSpkiB64":"eA","hkdfSaltB64":"cw","ivB64":"aXY","ciphertextB64":"Y3Q"}`;
    const m = msg({ id: 'm1', body: wire });
    expect(
      resolveMessageDisplayBody(m, false, {}, { m1: 'Peer hi' }),
    ).toBe('Peer hi');
  });

  it('shows ellipsis while peer E2EE decrypt is pending', () => {
    const wire = `${E2EE_BODY_PREFIX}{"v":1,"alg":"ecies-p256-hkdf-aes256gcm","ephPubSpkiB64":"eA","hkdfSaltB64":"cw","ivB64":"aXY","ciphertextB64":"Y3Q"}`;
    const m = msg({ id: 'm1', body: wire });
    expect(resolveMessageDisplayBody(m, false, {}, {})).toBe('\u2026');
  });
});
