import { describe, expect, it, vi } from 'vitest';

const { findUsersBySearchSubstringMatchMock } = vi.hoisted(() => ({
  findUsersBySearchSubstringMatchMock: vi.fn(),
}));

vi.mock('./repo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repo.js')>();
  return {
    ...actual,
    findUsersBySearchSubstringMatch: findUsersBySearchSubstringMatchMock,
  };
});

vi.mock('../conversations/repo.js', () => ({
  findDirectConversationIdBetween: vi.fn().mockResolvedValue(null),
}));

import { searchUsersForCaller } from './search.js';

describe('searchUsersForCaller guest directory', () => {
  it('passes guestDirectoryOnly when caller is guest', async () => {
    findUsersBySearchSubstringMatchMock.mockResolvedValueOnce([]);
    await searchUsersForCaller({
      callerUserId: 'g1',
      callerIsGuest: true,
      query: 'alice',
      limit: 10,
      maxCandidateScanCap: 200,
    });
    expect(findUsersBySearchSubstringMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        guestDirectoryOnly: true,
      }),
    );
  });

  it('does not set guestDirectoryOnly for registered callers', async () => {
    findUsersBySearchSubstringMatchMock.mockResolvedValueOnce([]);
    await searchUsersForCaller({
      callerUserId: 'u1',
      callerIsGuest: false,
      query: 'bob',
      limit: 10,
      maxCandidateScanCap: 200,
    });
    expect(findUsersBySearchSubstringMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        guestDirectoryOnly: false,
      }),
    );
  });
});
