import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import type { Env } from '../../config/env.js';
import { signAccessToken } from './accessToken.js';
import {
  resolveBearerAuth,
  verifyAccessTokenJwt,
} from './resolveBearer.js';

const baseEnv = {
  JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
  ACCESS_TOKEN_TTL_SECONDS: 3600,
} as Env;

function reqWithAuth(header: string): Request {
  return { headers: { authorization: header } } as unknown as Request;
}

describe('verifyAccessTokenJwt', () => {
  it('returns sub and guest flag from signed token', async () => {
    const { accessToken } = await signAccessToken(baseEnv, 'u-1', true, {
      guest: true,
      expiresInSeconds: 60,
    });
    const v = await verifyAccessTokenJwt(accessToken, baseEnv);
    expect(v).toMatchObject({ sub: 'u-1', guest: true });
  });

  it('returns guest false when claim absent', async () => {
    const { accessToken } = await signAccessToken(baseEnv, 'u-2', true);
    const v = await verifyAccessTokenJwt(accessToken, baseEnv);
    expect(v).toMatchObject({ sub: 'u-2', guest: false });
  });

  it('returns sourceDeviceId when embedded at sign time', async () => {
    const { accessToken } = await signAccessToken(baseEnv, 'u-dev', true, {
      sourceDeviceId: 'device-a',
      expiresInSeconds: 60,
    });
    const v = await verifyAccessTokenJwt(accessToken, baseEnv);
    expect(v).toMatchObject({ sub: 'u-dev', guest: false, sourceDeviceId: 'device-a' });
  });
});

describe('resolveBearerAuth', () => {
  it('parses Bearer JWT into jwt kind', async () => {
    const { accessToken } = await signAccessToken(baseEnv, 'u-3', true, {
      guest: true,
      expiresInSeconds: 60,
    });
    const r = await resolveBearerAuth(
      reqWithAuth(`Bearer ${accessToken}`),
      baseEnv,
    );
    expect(r).toMatchObject({ kind: 'jwt', sub: 'u-3', guest: true });
  });

  it('returns dev kind for X-User-Id when not production', async () => {
    const r = await resolveBearerAuth(
      {
        headers: { 'x-user-id': 'dev-user-1' },
      } as unknown as Request,
      { ...baseEnv, NODE_ENV: 'development' as const },
    );
    expect(r).toEqual({ kind: 'dev', sub: 'dev-user-1' });
  });
});
