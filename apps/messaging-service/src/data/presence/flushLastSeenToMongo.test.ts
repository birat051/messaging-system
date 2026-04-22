import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushLastSeenToMongo } from './flushLastSeenToMongo.js';

const { getLastSeenMock, deleteLastSeenRedisMock, updateOneMock } = vi.hoisted(
  () => ({
    getLastSeenMock: vi.fn(),
    deleteLastSeenRedisMock: vi.fn(),
    updateOneMock: vi.fn(),
  }),
);

vi.mock('./lastSeen.js', () => ({
  getLastSeen: (userId: string) => getLastSeenMock(userId),
  deleteLastSeenRedis: (userId: string) => deleteLastSeenRedisMock(userId),
}));

vi.mock('../db/mongo.js', () => ({
  getDb: () => ({
    collection: () => ({
      updateOne: (filter: unknown, update: unknown) =>
        updateOneMock(filter, update),
    }),
  }),
}));

describe('flushLastSeenToMongo', () => {
  beforeEach(() => {
    getLastSeenMock.mockReset();
    deleteLastSeenRedisMock.mockReset();
    updateOneMock.mockReset();
    updateOneMock.mockResolvedValue({ matchedCount: 1 });
  });

  it('writes Redis lastSeen time to MongoDB then deletes the Redis key', async () => {
    const at = new Date('2026-03-10T10:00:00.000Z');
    getLastSeenMock.mockResolvedValue(at);

    await flushLastSeenToMongo('user-x');

    expect(updateOneMock).toHaveBeenCalledWith(
      { id: 'user-x' },
      { $set: { lastSeenAt: at } },
    );
    expect(deleteLastSeenRedisMock).toHaveBeenCalledWith('user-x');
  });

  it('uses current time when Redis has no key (disconnect race)', async () => {
    getLastSeenMock.mockResolvedValue(null);
    const before = Date.now();

    await flushLastSeenToMongo('user-y');

    const after = Date.now();
    expect(updateOneMock).toHaveBeenCalledTimes(1);
    const setArg = updateOneMock.mock.calls[0][1] as {
      $set: { lastSeenAt: Date };
    };
    const written = setArg.$set.lastSeenAt.getTime();
    expect(written).toBeGreaterThanOrEqual(before);
    expect(written).toBeLessThanOrEqual(after);
    expect(deleteLastSeenRedisMock).toHaveBeenCalledWith('user-y');
  });
});
