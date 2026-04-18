import { describe, expect, it, vi } from 'vitest';
import { assertWebRtcSignalingPeerAllowed } from './webrtcSignalingAuthz.js';
import { findUserById } from '../users/repo.js';

vi.mock('../users/repo.js', () => ({
  findUserById: vi.fn(),
}));

describe('assertWebRtcSignalingPeerAllowed', () => {
  it('throws when from === to', async () => {
    await expect(assertWebRtcSignalingPeerAllowed('u1', 'u1')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('allows two registered users', async () => {
    vi.mocked(findUserById).mockImplementation(async (id: string) => ({
      id,
      email: `${id}@x.com`,
      username: id,
      passwordHash: 'x',
      displayName: null,
      profilePicture: null,
      status: null,
      emailVerified: true,
      isGuest: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await expect(
      assertWebRtcSignalingPeerAllowed('u1', 'u2'),
    ).resolves.toBeUndefined();
  });

  it('forbids guest ↔ registered (same as messaging)', async () => {
    vi.mocked(findUserById).mockImplementation(async (id: string) =>
      id === 'g1'
        ? {
            id: 'g1',
            passwordHash: 'x',
            displayName: null,
            profilePicture: null,
            status: null,
            emailVerified: false,
            isGuest: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : {
            id: 'r1',
            email: 'r@x.com',
            username: 'reg',
            passwordHash: 'x',
            displayName: null,
            profilePicture: null,
            status: null,
            emailVerified: true,
            isGuest: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
    );

    await expect(
      assertWebRtcSignalingPeerAllowed('g1', 'r1'),
    ).rejects.toMatchObject({ code: 'GUEST_MESSAGING_FORBIDDEN' });
  });
});
