import { describe, expect, it } from 'vitest';
import { registerRequestSchema } from './schemas.js';

describe('registerRequestSchema', () => {
  it('accepts valid email, password, username, displayName and normalizes username', () => {
    const r = registerRequestSchema.safeParse({
      email: 'User@Example.COM',
      password: 'password123',
      username: 'Cool_User',
      displayName: '  Cool Name  ',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.username).toBe('cool_user');
      expect(r.data.displayName).toBe('Cool Name');
    }
  });

  it('rejects username shorter than 3 chars', () => {
    const r = registerRequestSchema.safeParse({
      email: 'a@b.com',
      password: 'password123',
      username: 'ab',
      displayName: 'Name',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid username characters', () => {
    const r = registerRequestSchema.safeParse({
      email: 'a@b.com',
      password: 'password123',
      username: 'bad-user',
      displayName: 'Name',
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing username', () => {
    const r = registerRequestSchema.safeParse({
      email: 'a@b.com',
      password: 'password123',
      displayName: 'Name',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty displayName', () => {
    const r = registerRequestSchema.safeParse({
      email: 'a@b.com',
      password: 'password123',
      username: 'good_user',
      displayName: '   ',
    });
    expect(r.success).toBe(false);
  });
});
