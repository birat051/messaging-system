import { describe, expect, it, vi, beforeEach } from 'vitest';
import { API_PATHS } from './paths';

const get = vi.fn();
const patch = vi.fn();
const put = vi.fn();
const post = vi.fn();

vi.mock('./httpClient', () => ({
  httpClient: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
    put: (...args: unknown[]) => put(...args),
    post: (...args: unknown[]) => post(...args),
    delete: vi.fn(),
    defaults: { headers: {} },
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  },
}));

import {
  getCurrentUser,
  getUserPublicKeyById,
  putMyPublicKey,
  rotateMyPublicKey,
  searchUsersByEmail,
  updateCurrentUserProfile,
} from './usersApi';

describe('usersApi (vi.mock httpClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET public key by user id uses API_PATHS.users.publicKeyById', async () => {
    get.mockResolvedValue({
      data: {
        userId: 'peer-1',
        publicKey: 'cGJr',
        keyVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    await getUserPublicKeyById('peer-1');

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(API_PATHS.users.publicKeyById('peer-1'));
  });

  it('GET /users/search passes normalized email query and optional limit', async () => {
    get.mockResolvedValue({
      data: [
        {
          userId: 'u1',
          displayName: 'A',
          profilePicture: null,
          conversationId: null,
        },
      ],
    });

    await searchUsersByEmail({ email: 'found', limit: 10 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(API_PATHS.users.search, {
      params: { email: 'found', limit: 10 },
    });
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

  it('PUT public key uses API_PATHS.users.mePublicKey', async () => {
    put.mockResolvedValue({
      data: {
        userId: 'u1',
        publicKey: 'cGJr',
        keyVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const body = { publicKey: 'cGJr', keyVersion: 1 };
    await putMyPublicKey(body);

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(API_PATHS.users.mePublicKey, body);
  });

  it('POST rotate public key uses API_PATHS.users.mePublicKeyRotate', async () => {
    post.mockResolvedValue({
      data: {
        userId: 'u1',
        publicKey: 'cGsy',
        keyVersion: 2,
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });

    const body = { publicKey: 'cGsy' };
    await rotateMyPublicKey(body);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      API_PATHS.users.mePublicKeyRotate,
      body,
    );
  });
});
