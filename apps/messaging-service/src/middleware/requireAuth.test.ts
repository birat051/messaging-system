import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import type { Env } from '../config/env.js';
import { signAccessToken } from '../utils/auth/accessToken.js';
import { requireAuthenticatedUser } from './requireAuth.js';
import type { UserDocument } from '../data/users/users.collection.js';

vi.mock('../config/runtimeConfig.js', () => ({
  getEffectiveRuntimeConfig: vi.fn().mockResolvedValue({
    emailVerificationRequired: false,
    guestSessionsEnabled: true,
    guestDataTtlEnabled: true,
  }),
}));

vi.mock('../data/users/repo.js', () => ({
  findUserById: vi.fn(),
}));

import { findUserById } from '../data/users/repo.js';

const mockFindUserById = vi.mocked(findUserById);

const baseEnv = {
  JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
  ACCESS_TOKEN_TTL_SECONDS: 3600,
} as Env;

function baseUser(overrides: Partial<UserDocument> = {}): UserDocument {
  const now = new Date();
  return {
    id: 'user-1',
    email: 'a@b.com',
    passwordHash: 'x',
    username: 'u1',
    displayName: null,
    profilePicture: null,
    status: null,
    emailVerified: true,
    refreshTokenVersion: 0,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('requireAuthenticatedUser', () => {
  it('rejects when JWT guest claim does not match user.isGuest', async () => {
    const { accessToken } = await signAccessToken(baseEnv, 'user-1', true, {
      guest: true,
      expiresInSeconds: 60,
    });
    mockFindUserById.mockResolvedValue(baseUser({ id: 'user-1', isGuest: undefined }));
    const req = {
      headers: { authorization: `Bearer ${accessToken}` },
    } as Request;
    await expect(requireAuthenticatedUser(req, baseEnv)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts when JWT guest claim matches guest user', async () => {
    const { accessToken } = await signAccessToken(baseEnv, 'guest-1', true, {
      guest: true,
      expiresInSeconds: 60,
    });
    mockFindUserById.mockResolvedValue(
      baseUser({
        id: 'guest-1',
        isGuest: true,
        email: undefined,
        username: 'g1',
      }),
    );
    const req = {
      headers: { authorization: `Bearer ${accessToken}` },
    } as Request;
    const user = await requireAuthenticatedUser(req, baseEnv);
    expect(user.isGuest).toBe(true);
  });
});
