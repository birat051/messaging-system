import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import type { Env } from '../../config/env.js';
import {
  CLIENT_FINGERPRINT_HEADER,
  getClientFingerprintHeader,
  isGuestAuthRateLimited,
} from './guestAuthRateLimit.js';

vi.mock('./rateLimitRedis.js', () => ({
  rateLimitExceeded: vi.fn().mockResolvedValue(false),
}));

import { rateLimitExceeded } from './rateLimitRedis.js';

const mockRateLimitExceeded = vi.mocked(rateLimitExceeded);

const baseEnv = {
  GUEST_AUTH_RATE_LIMIT_WINDOW_SEC: 3600,
  GUEST_AUTH_RATE_LIMIT_MAX_PER_IP: 20,
  GUEST_AUTH_RATE_LIMIT_MAX_PER_FINGERPRINT: 10,
} as Env;

describe('getClientFingerprintHeader', () => {
  it('returns undefined when header missing', () => {
    expect(
      getClientFingerprintHeader({ headers: {} } as unknown as Request),
    ).toBeUndefined();
  });

  it('returns trimmed value', () => {
    const req = {
      headers: { [CLIENT_FINGERPRINT_HEADER]: '  abc  ' },
    } as unknown as Request;
    expect(getClientFingerprintHeader(req)).toBe('abc');
  });
});

describe('isGuestAuthRateLimited', () => {
  it('checks IP then fingerprint when fingerprint is provided', async () => {
    mockRateLimitExceeded.mockClear();
    await isGuestAuthRateLimited(baseEnv, {
      ip: '10.0.0.1',
      fingerprintRaw: 'device-1',
    });
    expect(mockRateLimitExceeded).toHaveBeenCalledTimes(2);
    expect(mockRateLimitExceeded).toHaveBeenNthCalledWith(
      1,
      'ratelimit:auth-guest:ip:10.0.0.1',
      3600,
      20,
    );
    expect(mockRateLimitExceeded).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^ratelimit:auth-guest:fp:[a-f0-9]{32}$/),
      3600,
      10,
    );
  });

  it('checks IP only when fingerprint omitted', async () => {
    mockRateLimitExceeded.mockClear();
    await isGuestAuthRateLimited(baseEnv, { ip: '10.0.0.2' });
    expect(mockRateLimitExceeded).toHaveBeenCalledTimes(1);
  });
});
