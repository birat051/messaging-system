import { describe, expect, it, vi, beforeEach } from 'vitest';
import { API_PATHS } from './paths';

const get = vi.fn();
const patch = vi.fn();

vi.mock('./httpClient', () => ({
  httpClient: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: {} },
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  },
}));

import { getCurrentUser, updateCurrentUserProfile } from './usersApi';

describe('usersApi (vi.mock httpClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET current user uses API_PATHS.users.me', async () => {
    get.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com' },
    });

    await getCurrentUser();

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(API_PATHS.users.me);
  });

  it('PATCH profile uses API_PATHS.users.me and FormData', async () => {
    patch.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', displayName: 'X' },
    });

    const fd = new FormData();
    fd.append('displayName', 'X');
    await updateCurrentUserProfile(fd);

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(
      API_PATHS.users.me,
      fd,
      expect.objectContaining({
        headers: { 'Content-Type': false },
      }),
    );
  });
});
