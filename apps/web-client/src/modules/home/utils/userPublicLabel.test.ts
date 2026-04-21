import { describe, expect, it } from 'vitest';
import {
  formatMissingPeerProfileLabel,
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

  it('falls back to Guest + id slice for guests without a name', () => {
    expect(
      formatUserPublicLabel({
        id: 'guest-user-id-1234567890',
        guest: true,
        displayName: null,
        profilePicture: null,
        status: null,
      }),
    ).toBe(`Guest ${'guest-user-id-1234567890'.slice(0, 8)}`);
  });

  it('falls back to User + id slice for registered users without a name', () => {
    expect(
      formatUserPublicLabel({
        id: 'registered-user-1234567890',
        guest: false,
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

describe('formatMissingPeerProfileLabel', () => {
  it('uses a stable slice of the peer id', () => {
    expect(formatMissingPeerProfileLabel('abc-def-ghi-jkl')).toBe(
      `Unknown contact · ${'abc-def-ghi-jkl'.slice(0, 8)}`,
    );
  });
});
