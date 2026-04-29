import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.js';
import type { UserDocument } from '../../data/users/users.collection.js';
import { issueAuthTokens } from './issueTokens.js';

const redisSet = vi.fn();

vi.mock('../../data/redis/redis.js', () => ({
  getRedisClient: () => ({
    set: redisSet,
    get: vi.fn(),
    del: vi.fn(),
  }),
}));

function baseUser(overrides: Partial<UserDocument> = {}): UserDocument {
  const now = new Date();
  return {
    id: 'user-guest-1',
    email: 'guest@example.com',
    passwordHash: 'x',
    displayName: null,
    profilePicture: null,
    status: null,
    emailVerified: true,
    refreshTokenVersion: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const baseEnv = {
  JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
  ACCESS_TOKEN_TTL_SECONDS: 86400,
  REFRESH_TOKEN_TTL_SECONDS: 604800,
  GUEST_ACCESS_TOKEN_TTL_SECONDS: 1800,
  GUEST_REFRESH_TOKEN_TTL_SECONDS: 1800,
} as Env;

describe('issueAuthTokens', () => {
  it('uses guest TTLs for access and refresh when guest option is true', async () => {
    redisSet.mockClear();
    const tokens = await issueAuthTokens(baseEnv, baseUser({ isGuest: true }), {
      guest: true,
    });
    expect(tokens.expiresIn).toBe(1800);
    expect(redisSet).toHaveBeenCalledTimes(1);
    const setArgs = redisSet.mock.calls[0] as [
      string,
      string,
      { EX: number },
    ];
    expect(setArgs[2]).toEqual({ EX: 1800 });
    expect(tokens.expiresAt).toBeDefined();
    expect(typeof tokens.expiresAt).toBe('string');
    expect(() => new Date(tokens.expiresAt!).toISOString()).not.toThrow();
  });

  it('uses registered-user TTLs when guest option is false', async () => {
    redisSet.mockClear();
    const tokens = await issueAuthTokens(baseEnv, baseUser({ isGuest: false }), {
      guest: false,
    });
    expect(tokens.expiresIn).toBe(86400);
    expect(redisSet).toHaveBeenCalledTimes(1);
    const setArgs = redisSet.mock.calls[0] as [
      string,
      string,
      { EX: number },
    ];
    expect(setArgs[2]).toEqual({ EX: 604800 });
    expect(tokens.expiresAt).toBeUndefined();
  });
});
