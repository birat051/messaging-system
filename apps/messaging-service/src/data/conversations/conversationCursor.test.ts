import { describe, expect, it } from 'vitest';
import { AppError } from '../../utils/errors/AppError.js';
import {
  encodeConversationListCursor,
  parseConversationListCursor,
} from './conversationCursor.js';

describe('conversationCursor', () => {
  it('round-trips updatedAt + id', () => {
    const updatedAt = new Date('2026-04-12T12:00:00.000Z');
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const raw = encodeConversationListCursor({ updatedAt, id });
    const parsed = parseConversationListCursor(raw);
    expect(parsed.id).toBe(id);
    expect(parsed.updatedAt.toISOString()).toBe(updatedAt.toISOString());
  });

  it('rejects garbage', () => {
    expect(() => parseConversationListCursor('not-a-cursor')).toThrow(AppError);
    try {
      parseConversationListCursor('not-a-cursor');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_REQUEST');
      expect((e as AppError).statusCode).toBe(400);
    }
  });
});
