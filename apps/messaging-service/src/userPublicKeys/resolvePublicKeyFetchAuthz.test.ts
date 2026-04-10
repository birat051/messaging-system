import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { resolvePublicKeyFetchAuthz } from './resolvePublicKeyFetchAuthz.js';

vi.mock('../users/repo.js', () => ({
  findUserById: vi.fn(),
}));

vi.mock('../conversations/repo.js', () => ({
  findDirectConversationIdBetween: vi.fn(),
}));

import { findDirectConversationIdBetween } from '../conversations/repo.js';
import { findUserById } from '../users/repo.js';

const mockFindUser = vi.mocked(findUserById);
const mockDirect = vi.mocked(findDirectConversationIdBetween);

const looseEnv = {
  PUBLIC_KEY_FETCH_REQUIRE_DIRECT_THREAD: false,
} as Env;

const strictEnv = {
  PUBLIC_KEY_FETCH_REQUIRE_DIRECT_THREAD: true,
} as Env;

describe('resolvePublicKeyFetchAuthz', () => {
  beforeEach(() => {
    mockFindUser.mockReset();
    mockDirect.mockReset();
  });

  it('allows self without loading target user', async () => {
    const r = await resolvePublicKeyFetchAuthz('u1', 'u1', looseEnv);
    expect(r).toBe('ok');
    expect(mockFindUser).not.toHaveBeenCalled();
    expect(mockDirect).not.toHaveBeenCalled();
  });

  it('loose mode allows when target user exists', async () => {
    mockFindUser.mockResolvedValue({ id: 'u2' } as never);
    const r = await resolvePublicKeyFetchAuthz('u1', 'u2', looseEnv);
    expect(r).toBe('ok');
    expect(mockDirect).not.toHaveBeenCalled();
  });

  it('returns target_not_found when target user is missing', async () => {
    mockFindUser.mockResolvedValue(null);
    const r = await resolvePublicKeyFetchAuthz('u1', 'u2', looseEnv);
    expect(r).toBe('target_not_found');
  });

  it('strict mode allows when a direct conversation exists', async () => {
    mockFindUser.mockResolvedValue({ id: 'u2' } as never);
    mockDirect.mockResolvedValue('conv-1');
    const r = await resolvePublicKeyFetchAuthz('u1', 'u2', strictEnv);
    expect(r).toBe('ok');
  });

  it('strict mode forbids when no direct thread', async () => {
    mockFindUser.mockResolvedValue({ id: 'u2' } as never);
    mockDirect.mockResolvedValue(null);
    const r = await resolvePublicKeyFetchAuthz('u1', 'u2', strictEnv);
    expect(r).toBe('forbidden');
  });
});
