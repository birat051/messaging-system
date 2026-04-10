import { describe, expect, it } from 'vitest';
import type { components } from '@/generated/api-types';
import { parseMessageSendAck } from './socketMessageAck';

type Message = components['schemas']['Message'];

const sampleMessage: Message = {
  id: 'm1',
  conversationId: 'c1',
  senderId: 'u1',
  body: 'hi',
  mediaKey: null,
  createdAt: new Date().toISOString(),
};

describe('parseMessageSendAck', () => {
  it('accepts a full Message ack', () => {
    const r = parseMessageSendAck(sampleMessage);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.message).toEqual(sampleMessage);
    }
  });

  it('rejects with server error code + message', () => {
    const r = parseMessageSendAck({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many message send requests; try again later',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('Too many message send requests; try again later');
    }
  });

  it('rejects with code only when message is absent', () => {
    const r = parseMessageSendAck({ code: 'UNAUTHORIZED' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('UNAUTHORIZED');
    }
  });

  it('rejects unknown ack shapes', () => {
    const r = parseMessageSendAck({ foo: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('Invalid message:send ack');
    }
  });
});
