import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.js';
import { signAccessToken } from './accessToken.js';

const baseEnv = {
  JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
  ACCESS_TOKEN_TTL_SECONDS: 3600,
} as Env;

describe('signAccessToken', () => {
  it('includes guest claim in JWT when guest option is true', async () => {
    const { accessToken } = await signAccessToken(
      baseEnv,
      'user-1',
      true,
      { guest: true, expiresInSeconds: 900 },
    );
    const key = new TextEncoder().encode(baseEnv.JWT_SECRET!.trim());
    const { payload } = await jwtVerify(accessToken, key, {
      algorithms: ['HS256'],
    });
    expect(payload.guest).toBe(true);
    expect(payload.email_verified).toBe(true);
    expect(payload.sub).toBe('user-1');
  });

  it('does not set guest claim when not a guest', async () => {
    const { accessToken } = await signAccessToken(baseEnv, 'user-2', true);
    const key = new TextEncoder().encode(baseEnv.JWT_SECRET!.trim());
    const { payload } = await jwtVerify(accessToken, key, {
      algorithms: ['HS256'],
    });
    expect(payload.guest).toBeUndefined();
  });
});
