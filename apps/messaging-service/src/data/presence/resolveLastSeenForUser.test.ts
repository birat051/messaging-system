import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLastSeenForUser } from './resolveLastSeen.js';

const { getLastSeenMock, findOneMock } = vi.hoisted(() => ({
  getLastSeenMock: vi.fn(),
  findOneMock: vi.fn(),
}));

vi.mock('./lastSeen.js', () => ({
  getLastSeen: (userId: string) => getLastSeenMock(userId),
}));

vi.mock('../db/mongo.js', () => ({
  getDb: () => ({
    collection: () => ({
      findOne: (filter: unknown, opts?: unknown) => findOneMock(filter, opts),
    }),
  }),
}));

describe('resolveLastSeenForUser', () => {
  beforeEach(() => {
    getLastSeenMock.mockReset();
    findOneMock.mockReset();
  });

  it('returns redis source when Redis has a value', async () => {
    const at = new Date('2026-01-15T12:00:00.000Z');
    getLastSeenMock.mockResolvedValue(at);

    const r = await resolveLastSeenForUser('user-1');

    expect(r).toEqual({
      status: 'ok',
      source: 'redis',
      lastSeenAt: at.toISOString(),
    });
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('falls back to MongoDB users.lastSeenAt when Redis misses', async () => {
    getLastSeenMock.mockResolvedValue(null);
    const at = new Date('2026-02-01T08:30:00.000Z');
    findOneMock.mockResolvedValue({ lastSeenAt: at });

    const r = await resolveLastSeenForUser('user-2');

    expect(r).toEqual({
      status: 'ok',
      source: 'mongodb',
      lastSeenAt: at.toISOString(),
    });
    expect(findOneMock).toHaveBeenCalledTimes(1);
  });

  it('returns not_available when neither Redis nor Mongo has a value', async () => {
    getLastSeenMock.mockResolvedValue(null);
    findOneMock.mockResolvedValue(null);

    const r = await resolveLastSeenForUser('user-3');

    expect(r).toEqual({ status: 'not_available' });
  });

  it('rejects empty targetUserId after trim', async () => {
    const r = await resolveLastSeenForUser('   ');

    expect(r).toMatchObject({
      status: 'error',
      code: 'invalid_payload',
    });
    expect(getLastSeenMock).not.toHaveBeenCalled();
  });
});
