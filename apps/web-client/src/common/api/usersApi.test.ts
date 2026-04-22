import { describe, expect, it, vi, beforeEach } from 'vitest';
import { API_PATHS } from './paths';

const get = vi.fn();
const patch = vi.fn();
const post = vi.fn();
const del = vi.fn();

vi.mock('./httpClient', () => ({
  httpClient: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
    put: vi.fn(),
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
    defaults: { headers: {} },
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  },
}));

import {
  deleteMyDevice,
  getCurrentUser,
  listUserDevicePublicKeys,
  postMyAvatarPresign,
  registerMyDevice,
  searchUsers,
  updateCurrentUserProfile,
  updateCurrentUserProfileJson,
} from './usersApi';

describe('usersApi (vi.mock httpClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET device public keys uses API_PATHS.users.devicePublicKeysByUserId', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            deviceId: 'd1',
            publicKey: 'cGJr',
            keyVersion: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    await listUserDevicePublicKeys('peer-1');

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      API_PATHS.users.devicePublicKeysByUserId('peer-1'),
    );
  });

  it('GET /users/search passes q query and optional limit', async () => {
    get.mockResolvedValue({
      data: [
        {
          userId: 'u1',
          username: 'a_user',
          displayName: 'A',
          profilePicture: null,
          conversationId: null,
        },
      ],
    });

    await searchUsers({ query: 'found', limit: 10 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(API_PATHS.users.search, {
      params: { q: 'found', limit: 10 },
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

  it('DELETE device uses API_PATHS.users.meDeviceById', async () => {
    del.mockResolvedValue({ data: undefined, status: 204 });

    await deleteMyDevice('dev-abc');

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(API_PATHS.users.meDeviceById('dev-abc'));
  });

  it('POST /users/me/avatar/presign uses API_PATHS.users.meAvatarPresign', async () => {
    post.mockResolvedValue({
      data: {
        method: 'PUT',
        url: 'https://example/p',
        key: 'users/u1/k',
        bucket: 'b',
        expiresAt: '2026-01-01T00:00:00.000Z',
        headers: { 'Content-Type': 'image/png', 'Content-Length': '3' },
      },
    });

    await postMyAvatarPresign({
      contentType: 'image/png',
      contentLength: 3,
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      API_PATHS.users.meAvatarPresign,
      { contentType: 'image/png', contentLength: 3 },
      expect.anything(),
    );
  });

  it('PATCH profile JSON uses API_PATHS.users.me', async () => {
    patch.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', displayName: 'X' },
    });

    await updateCurrentUserProfileJson({ profilePictureMediaKey: 'users/u1/k' });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(
      API_PATHS.users.me,
      { profilePictureMediaKey: 'users/u1/k' },
      expect.anything(),
    );
  });

  it('POST register device uses API_PATHS.users.meDevices', async () => {
    post.mockResolvedValue({
      data: {
        deviceId: 'dev-1',
        publicKey: 'cGJr',
        keyVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const body = { publicKey: 'cGJr' };
    await registerMyDevice(body);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(API_PATHS.users.meDevices, body);
  });
});
