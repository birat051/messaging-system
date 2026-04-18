import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.js';
import { isMessageSendRateLimited } from './messageSendRateLimit.js';

vi.mock('../../utils/auth/rateLimitRedis.js', () => ({
  rateLimitExceeded: vi.fn().mockResolvedValue(false),
}));

import { rateLimitExceeded } from '../../utils/auth/rateLimitRedis.js';

const mockRateLimitExceeded = vi.mocked(rateLimitExceeded);

const baseEnv = {
  MESSAGE_SEND_RATE_LIMIT_WINDOW_SEC: 60,
  MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER: 120,
  GUEST_MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER: 30,
  MESSAGE_SEND_RATE_LIMIT_MAX_PER_IP: 360,
  MESSAGE_SEND_RATE_LIMIT_MAX_PER_SOCKET: 120,
} as Env;

describe('isMessageSendRateLimited', () => {
  it('uses guest-user Redis key and guest max when isGuest is true', async () => {
    mockRateLimitExceeded.mockClear();
    await isMessageSendRateLimited(baseEnv, {
      userId: 'g1',
      ip: '1.2.3.4',
      isGuest: true,
    });
    expect(mockRateLimitExceeded).toHaveBeenNthCalledWith(
      1,
      'ratelimit:message-send:guest-user:g1',
      60,
      30,
    );
  });

  it('uses standard user key when isGuest is false or omitted', async () => {
    mockRateLimitExceeded.mockClear();
    await isMessageSendRateLimited(baseEnv, {
      userId: 'u1',
      ip: '1.2.3.4',
    });
    expect(mockRateLimitExceeded).toHaveBeenNthCalledWith(
      1,
      'ratelimit:message-send:user:u1',
      60,
      120,
    );
  });
});
