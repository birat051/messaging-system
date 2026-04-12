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
});
