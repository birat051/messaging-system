import { describe, expect, it } from 'vitest';
import { guestAuthResponseSchema } from './schemas.js';

describe('guestAuthResponseSchema', () => {
  it('accepts a conforming GuestAuthResponse shape', () => {
    const parsed = guestAuthResponseSchema.safeParse({
      accessToken: 'a.b.c',
      refreshToken: 'opaque',
      tokenType: 'Bearer',
      expiresIn: 1800,
      expiresAt: '2026-01-01T12:00:00.000Z',
      user: {
        id: 'u1',
        email: null,
        username: 'guest_user',
        displayName: 'Guest',
        emailVerified: true,
        profilePicture: null,
        status: null,
        guest: true,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects wrong tokenType', () => {
    const parsed = guestAuthResponseSchema.safeParse({
      accessToken: 'a',
      refreshToken: 'b',
      tokenType: 'Basic',
      expiresIn: 1800,
      expiresAt: '2026-01-01T12:00:00.000Z',
      user: {
        id: 'u1',
        email: null,
        username: 'guest_user',
        displayName: 'Guest',
        emailVerified: true,
        profilePicture: null,
        status: null,
        guest: true,
      },
    });
    expect(parsed.success).toBe(false);
  });
});
