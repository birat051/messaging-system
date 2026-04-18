import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { DuplicateUsernameError } from '../data/users/repo.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { createAuthRouter } from './auth.js';

vi.mock('../config/runtimeConfig.js', () => ({
  getEffectiveRuntimeConfig: vi.fn(),
}));

const guestAuthIncrCounts = new Map<string, number>();

vi.mock('../data/redis/redis.js', () => ({
  getRedisClient: () => ({
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(async (key: string) => {
      const n = (guestAuthIncrCounts.get(key) ?? 0) + 1;
      guestAuthIncrCounts.set(key, n);
      return n;
    }),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock('../data/users/repo.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../data/users/repo.js')>();
  return {
    ...actual,
    createGuestUser: vi.fn(),
  };
});

import { getEffectiveRuntimeConfig } from '../config/runtimeConfig.js';
import { createGuestUser } from '../data/users/repo.js';

const mockGetEffectiveRuntimeConfig = vi.mocked(getEffectiveRuntimeConfig);
const mockCreateGuestUser = vi.mocked(createGuestUser);

const baseEnv = {
  JWT_SECRET: 'test-secret-at-least-thirty-two-chars-long',
  GUEST_SESSIONS_ENABLED: true,
  GUEST_ACCESS_TOKEN_TTL_SECONDS: 1800,
  GUEST_REFRESH_TOKEN_TTL_SECONDS: 1800,
  GUEST_DATA_TTL_ENABLED: true,
  GUEST_DATA_MONGODB_TTL_SECONDS: 86400,
  GUEST_AUTH_RATE_LIMIT_WINDOW_SEC: 3600,
  GUEST_AUTH_RATE_LIMIT_MAX_PER_IP: 100,
  GUEST_AUTH_RATE_LIMIT_MAX_PER_FINGERPRINT: 100,
  GUEST_MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER: 30,
  ACCESS_TOKEN_TTL_SECONDS: 3600,
  REFRESH_TOKEN_TTL_SECONDS: 604800,
  REGISTER_RATE_LIMIT_WINDOW_SEC: 3600,
  REGISTER_RATE_LIMIT_MAX: 5,
  RESEND_RATE_LIMIT_WINDOW_SEC: 3600,
  RESEND_RATE_LIMIT_MAX: 3,
  VERIFY_EMAIL_RATE_LIMIT_WINDOW_SEC: 3600,
  VERIFY_EMAIL_RATE_LIMIT_MAX: 30,
  FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SEC: 3600,
  FORGOT_PASSWORD_RATE_LIMIT_MAX: 5,
} as Env;

function buildApp(env: Env): express.Application {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use('/v1', createAuthRouter(env));
  app.use(errorHandler);
  return app;
}

describe('POST /v1/auth/guest', () => {
  beforeEach(() => {
    guestAuthIncrCounts.clear();
    mockGetEffectiveRuntimeConfig.mockReset();
    mockCreateGuestUser.mockReset();
  });

  it('returns 403 GUEST_SESSIONS_DISABLED when effective config disables guest sessions', async () => {
    mockGetEffectiveRuntimeConfig.mockResolvedValue({
      emailVerificationRequired: false,
      guestSessionsEnabled: false,
      guestDataTtlEnabled: true,
    });
    const app = buildApp(baseEnv);
    const res = await request(app)
      .post('/v1/auth/guest')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: 'GUEST_SESSIONS_DISABLED',
      message: 'Guest sessions are disabled.',
    });
    expect(mockGetEffectiveRuntimeConfig).toHaveBeenCalledWith(baseEnv);
  });

  it('returns 403 before body validation when guest sessions are disabled', async () => {
    mockGetEffectiveRuntimeConfig.mockResolvedValue({
      emailVerificationRequired: false,
      guestSessionsEnabled: false,
      guestDataTtlEnabled: true,
    });
    const app = buildApp(baseEnv);
    const res = await request(app)
      .post('/v1/auth/guest')
      .send({ username: 'ab', displayName: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('GUEST_SESSIONS_DISABLED');
  });

  it('returns 200 with GuestAuthResponse when guest sessions are enabled', async () => {
    mockGetEffectiveRuntimeConfig.mockResolvedValue({
      emailVerificationRequired: false,
      guestSessionsEnabled: true,
      guestDataTtlEnabled: true,
    });
    const now = new Date();
    mockCreateGuestUser.mockResolvedValue({
      id: 'guest-user-id-1',
      username: 'guest_user',
      passwordHash: 'argon2-placeholder',
      displayName: 'Guest',
      profilePicture: null,
      status: null,
      emailVerified: true,
      isGuest: true,
      refreshTokenVersion: 0,
      lastSeenAt: null,
      createdAt: now,
      updatedAt: now,
      guestDataExpiresAt: new Date(Date.now() + 86_400_000),
    });
    const app = buildApp(baseEnv);
    const res = await request(app)
      .post('/v1/auth/guest')
      .send({ username: 'guest_user', displayName: 'Guest' });
    expect(res.status).toBe(200);
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.expiresIn).toBe(1800);
    expect(typeof res.body.expiresAt).toBe('string');
    expect(res.body.user).toMatchObject({
      id: 'guest-user-id-1',
      username: 'guest_user',
      guest: true,
      email: null,
    });
    expect(res.body.accessToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('returns 429 when guest auth rate limit per IP is exceeded', async () => {
    mockGetEffectiveRuntimeConfig.mockResolvedValue({
      emailVerificationRequired: false,
      guestSessionsEnabled: true,
      guestDataTtlEnabled: true,
    });
    const now = new Date();
    mockCreateGuestUser.mockResolvedValue({
      id: 'guest-user-id-1',
      username: 'u1',
      passwordHash: 'x',
      displayName: null,
      profilePicture: null,
      status: null,
      emailVerified: true,
      isGuest: true,
      refreshTokenVersion: 0,
      lastSeenAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const strictEnv = {
      ...baseEnv,
      GUEST_AUTH_RATE_LIMIT_MAX_PER_IP: 1,
    } as Env;
    const app = buildApp(strictEnv);
    const ok = await request(app)
      .post('/v1/auth/guest')
      .send({ username: 'first_only' });
    expect(ok.status).toBe(200);
    const limited = await request(app)
      .post('/v1/auth/guest')
      .send({ username: 'second_try' });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('returns 409 USERNAME_TAKEN when username collides', async () => {
    mockGetEffectiveRuntimeConfig.mockResolvedValue({
      emailVerificationRequired: false,
      guestSessionsEnabled: true,
      guestDataTtlEnabled: true,
    });
    mockCreateGuestUser.mockRejectedValue(
      new DuplicateUsernameError('taken_name'),
    );
    const app = buildApp(baseEnv);
    const res = await request(app)
      .post('/v1/auth/guest')
      .send({ username: 'taken_name' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });
});
