import { describe, expect, it } from 'vitest';
import type { components } from '@/generated/api-types';
import { parseMessageNewPayload } from './socketMessageNew';

type Message = components['schemas']['Message'];

const sampleMessage: Message = {
  id: 'm1',
  conversationId: 'c1',
  senderId: 'u1',
  body: 'hi',
  mediaKey: null,
  createdAt: new Date().toISOString(),
};

describe('parseMessageNewPayload', () => {
  it('accepts a full Message payload', () => {
    expect(parseMessageNewPayload(sampleMessage)).toEqual(sampleMessage);
  });

  it('accepts minimal required fields', () => {
    const m: Message = {
      id: 'm2',
      conversationId: 'c2',
      senderId: 'u2',
      createdAt: new Date().toISOString(),
    };
    expect(parseMessageNewPayload(m)).toEqual(m);
  });

  it('rejects invalid shapes', () => {
    expect(parseMessageNewPayload(null)).toBeNull();
    expect(parseMessageNewPayload({})).toBeNull();
    expect(parseMessageNewPayload({ id: 'x' })).toBeNull();
    expect(parseMessageNewPayload({ ...sampleMessage, body: 1 })).toBeNull();
  });

  it('preserves mediaKey from message:new (same string as POST /media/upload key → send → DB)', () => {
    const key = 'users/u1/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-shot.jpg';
    const incoming = {
      id: 'msg-media-1',
      conversationId: 'c1',
      senderId: 'u1',
      body: null,
      mediaKey: key,
      createdAt: new Date().toISOString(),
    };
    expect(parseMessageNewPayload(incoming)).toEqual(
      expect.objectContaining({ mediaKey: key }),
    );
  });

  it('preserves hybrid E2EE fields so attachment inner m.k can be decrypted (mediaKey null on wire)', () => {
    const incoming = {
      id: '62460ea2-035d-4d95-b685-3e9322f2720f',
      conversationId: '91429303-3fa0-4b70-a318-5cecc83f8392',
      senderId: '951420bd-37a3-4399-8908-06507b56c063',
      body: 'base64ciphertext',
      mediaKey: null,
      iv: 'Tllc5CUo6rSRY0Lg',
      algorithm: 'aes-256-gcm+p256-hybrid-v1',
      encryptedMessageKeys: {
        '435af490-5232-49e1-8c81-344acc599a1e': 'wrap1',
        '44564c18-44dc-41f7-8c70-a777da10d408': 'wrap2',
      },
      createdAt: '2026-04-27T21:41:38.619Z',
    };
    const parsed = parseMessageNewPayload(incoming);
    expect(parsed).toEqual(incoming);
  });

  it('rejects encryptedMessageKeys when a value is not a string', () => {
    expect(
      parseMessageNewPayload({
        ...sampleMessage,
        encryptedMessageKeys: { x: 1 as unknown as string },
      }),
    ).toBeNull();
  });
});
