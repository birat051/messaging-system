import { describe, expect, it } from 'vitest';
import type { UserDocument } from '../users/users.collection.js';
import { assertGuestGuestDirectMessagingAllowed } from './guestMessagingAuthz.js';

function u(p: Partial<UserDocument> & { id: string }): UserDocument {
  const now = new Date();
  return {
    passwordHash: 'x',
    displayName: null,
    profilePicture: null,
    status: null,
    emailVerified: true,
    refreshTokenVersion: 0,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
    ...p,
  } as UserDocument;
}

describe('assertGuestGuestDirectMessagingAllowed', () => {
  it('allows guest → guest', () => {
    expect(() =>
      assertGuestGuestDirectMessagingAllowed(
        u({ id: 'a', username: 'g1', isGuest: true }),
        u({ id: 'b', username: 'g2', isGuest: true }),
      ),
    ).not.toThrow();
  });

  it('allows registered → registered', () => {
    expect(() =>
      assertGuestGuestDirectMessagingAllowed(
        u({
          id: 'a',
          email: 'a@b.com',
          username: 'r1',
          isGuest: undefined,
        }),
        u({
          id: 'b',
          email: 'c@b.com',
          username: 'r2',
          isGuest: false,
        }),
      ),
    ).not.toThrow();
  });

  it('rejects guest → registered', () => {
    expect(() =>
      assertGuestGuestDirectMessagingAllowed(
        u({ id: 'a', username: 'g1', isGuest: true }),
        u({
          id: 'b',
          email: 'x@y.com',
          username: 'r1',
          isGuest: undefined,
        }),
      ),
    ).toThrowError('Guests can only message other guests');
  });

  it('rejects registered → guest', () => {
    expect(() =>
      assertGuestGuestDirectMessagingAllowed(
        u({
          id: 'a',
          email: 'x@y.com',
          username: 'r1',
          isGuest: false,
        }),
        u({ id: 'b', username: 'g1', isGuest: true }),
      ),
    ).toThrowError('Registered users cannot message guest accounts');
  });
});
