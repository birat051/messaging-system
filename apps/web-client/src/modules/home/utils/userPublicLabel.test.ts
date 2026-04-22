import { describe, expect, it } from 'vitest';
import {
  formatMissingPeerProfileLabel,
  formatPendingDirectPeerLabel,
  formatUserPublicLabel,
  isDirectPeerSelf,
} from './userPublicLabel';

describe('formatUserPublicLabel', () => {
  it('prefers displayName when set', () => {
    expect(
      formatUserPublicLabel({
        id: 'u-1',
        guest: false,
        displayName: '  Ada  ',
        profilePicture: null,
        status: null,
      }),
    ).toBe('Ada');
  });

  it('falls back to @username when displayName is unset (guest)', () => {
    expect(
      formatUserPublicLabel({
        id: 'guest-user-id-1234567890',
        guest: true,
        username: 'cool_guest',
        displayName: null,
        profilePicture: null,
        status: null,
      }),
    ).toBe('@cool_guest');
  });

  it('falls back to Guest + id slice for guests without displayName or username', () => {
    expect(
      formatUserPublicLabel({
        id: 'guest-user-id-1234567890',
        guest: true,
        username: null,
        displayName: null,
        profilePicture: null,
        status: null,
      }),
    ).toBe(`Guest ${'guest-user-id-1234567890'.slice(0, 8)}`);
  });

  it('falls back to @username for registered users without displayName', () => {
    expect(
      formatUserPublicLabel({
        id: 'registered-user-1234567890',
        guest: false,
        username: 'ada_dev',
        displayName: null,
        profilePicture: null,
        status: null,
      }),
    ).toBe('@ada_dev');
  });

  it('falls back to User + id slice for registered users without displayName or username', () => {
    expect(
      formatUserPublicLabel({
        id: 'registered-user-1234567890',
        guest: false,
        username: null,
        displayName: null,
        profilePicture: null,
        status: null,
      }),
    ).toBe(`User ${'registered-user-1234567890'.slice(0, 8)}`);
  });
});

describe('isDirectPeerSelf', () => {
  it('is true when ids match after trim', () => {
    expect(isDirectPeerSelf('  u1  ', 'u1')).toBe(true);
  });

  it('is false when either side is missing', () => {
    expect(isDirectPeerSelf('u1', null)).toBe(false);
    expect(isDirectPeerSelf(null, 'u1')).toBe(false);
  });
});

describe('formatPendingDirectPeerLabel', () => {
  it('matches UserPublic order: displayName, then @username, then Guest slice', () => {
    expect(
      formatPendingDirectPeerLabel({
        userId: 'g-uuid-1234',
        displayName: '  Tea  ',
        username: 'tea_g',
        profilePicture: null,
        guest: true,
      }),
    ).toBe('Tea');
    expect(
      formatPendingDirectPeerLabel({
        userId: 'g-uuid-1234',
        displayName: null,
        username: 'tea_g',
        profilePicture: null,
        guest: true,
      }),
    ).toBe('@tea_g');
    expect(
      formatPendingDirectPeerLabel({
        userId: 'g-uuid-1234567890',
        displayName: null,
        username: null,
        profilePicture: null,
        guest: true,
      }),
    ).toBe(`Guest ${'g-uuid-1234567890'.slice(0, 8)}`);
  });

  it('uses User slice when not guest', () => {
    expect(
      formatPendingDirectPeerLabel({
        userId: 'u-uuid-1234567890',
        displayName: null,
        username: null,
        profilePicture: null,
        guest: false,
      }),
    ).toBe(`User ${'u-uuid-1234567890'.slice(0, 8)}`);
  });
});

describe('formatMissingPeerProfileLabel', () => {
  it('uses a stable slice of the peer id', () => {
    expect(formatMissingPeerProfileLabel('abc-def-ghi-jkl')).toBe(
      `Unknown contact · ${'abc-def-ghi-jkl'.slice(0, 8)}`,
    );
  });
});
