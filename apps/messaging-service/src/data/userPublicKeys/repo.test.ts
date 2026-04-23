import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPublicKeyDocument } from './user_public_keys.collection.js';
import { findDevicePublicKeysByUserId } from './repo.js';

const findMock = vi.fn();
const toArrayMock = vi.fn();

vi.mock('../../data/db/mongo.js', () => ({
  getDb: () => ({
    collection: () => ({
      find: (filter: unknown) => {
        findMock(filter);
        return {
          sort: () => ({
            toArray: () => toArrayMock(),
          }),
        };
      },
    }),
  }),
}));

describe('findDevicePublicKeysByUserId', () => {
  beforeEach(() => {
    findMock.mockClear();
    toArrayMock.mockReset();
  });

  it('returns every device row for the user (no limit)', async () => {
    const a: UserPublicKeyDocument = {
      userId: 'user-1',
      deviceId: 'dev-a',
      publicKey: 'spki-a',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    };
    const b: UserPublicKeyDocument = {
      userId: 'user-1',
      deviceId: 'dev-b',
      publicKey: 'spki-b',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T12:00:00.000Z'),
    };
    toArrayMock.mockResolvedValue([a, b]);

    const rows = await findDevicePublicKeysByUserId('user-1');

    expect(findMock).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.deviceId).sort()).toEqual(['dev-a', 'dev-b']);
  });

  it('returns empty array when userId is blank', async () => {
    const rows = await findDevicePublicKeysByUserId('   ');

    expect(findMock).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });
});
