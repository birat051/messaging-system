import { describe, expect, it } from 'vitest';
import {
  createSearchUsersQuerySchema,
  searchUsersQuerySchema,
} from './schemas.js';

describe('searchUsersQuerySchema', () => {
  it('accepts partial query via email, trims and lowercases to q', () => {
    const r = searchUsersQuerySchema.safeParse({
      email: '  Found@Example.COM ',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.q).toBe('found@example.com');
    }
  });

  it('accepts q parameter', () => {
    const r = searchUsersQuerySchema.safeParse({
      q: 'Alice',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.q).toBe('alice');
    }
  });

  it('rejects single character', () => {
    const r = searchUsersQuerySchema.safeParse({ email: 'a' });
    expect(r.success).toBe(false);
  });

  it('rejects two characters when min length is 3 (default abuse bound)', () => {
    const r = searchUsersQuerySchema.safeParse({ email: 'ab' });
    expect(r.success).toBe(false);
  });

  it('accepts two characters when min length is 2', () => {
    const schema = createSearchUsersQuerySchema(2);
    const r = schema.safeParse({ email: 'ab' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.q).toBe('ab');
    }
  });

  it('rejects disallowed characters', () => {
    const r = searchUsersQuerySchema.safeParse({ email: 'foo bar' });
    expect(r.success).toBe(false);
  });

  it('allows underscore for username fragments', () => {
    const r = searchUsersQuerySchema.safeParse({ q: 'alice_dev' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.q).toBe('alice_dev');
    }
  });

  it('rejects when both q and email missing', () => {
    const r = searchUsersQuerySchema.safeParse({ limit: 10 });
    expect(r.success).toBe(false);
  });
});
