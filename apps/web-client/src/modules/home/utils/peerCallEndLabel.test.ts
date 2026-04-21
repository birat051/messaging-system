import { describe, expect, it } from 'vitest';
import { formatPeerCallEndLabel } from './peerCallEndLabel';

describe('formatPeerCallEndLabel', () => {
  it('prefers display name over username', () => {
    expect(
      formatPeerCallEndLabel({
        userId: 'u-1',
        displayName: 'Alex',
        username: 'alex_handle',
      }),
    ).toBe('Alex');
  });

  it('uses username when display name is empty', () => {
    expect(
      formatPeerCallEndLabel({
        userId: 'u-1',
        displayName: null,
        username: 'jordan_guest',
      }),
    ).toBe('jordan_guest');
  });

  it('falls back to user id hint when no names', () => {
    expect(
      formatPeerCallEndLabel({
        userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        displayName: '  ',
        username: null,
      }),
    ).toMatch(/^User aaaaaaaa/);
  });
});
