import { describe, expect, it } from 'vitest';
import { AppError } from '../../utils/errors/AppError.js';
import {
  encodeMessageListCursor,
  parseMessageListCursor,
} from './messageCursor.js';

describe('messageCursor', () => {
  it('round-trips createdAt + id', () => {
    const createdAt = new Date('2026-04-12T12:00:00.000Z');
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const raw = encodeMessageListCursor({ createdAt, id });
    const parsed = parseMessageListCursor(raw);
    expect(parsed.id).toBe(id);
    expect(parsed.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it('rejects garbage', () => {
    expect(() => parseMessageListCursor('not-a-cursor')).toThrow(AppError);
    try {
      parseMessageListCursor('not-a-cursor');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_REQUEST');
      expect((e as AppError).statusCode).toBe(400);
    }
  });
});
