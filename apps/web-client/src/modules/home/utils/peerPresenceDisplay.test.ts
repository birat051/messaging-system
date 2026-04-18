import { describe, expect, it } from 'vitest';
import type { UserPresenceEntry } from '@/modules/app/stores/presenceTypes';
import {
  formatRelativeLastSeenAge,
  peerPresenceDisplay,
} from './peerPresenceDisplay';

describe('formatRelativeLastSeenAge', () => {
  it('formats minutes and hours', () => {
    const now = Date.parse('2026-04-12T14:00:00.000Z');
    expect(
      formatRelativeLastSeenAge('2026-04-12T13:50:00.000Z', now),
    ).toBe('10m ago');
    expect(
      formatRelativeLastSeenAge('2026-04-12T11:00:00.000Z', now),
    ).toBe('3h ago');
  });
});

describe('peerPresenceDisplay', () => {
  const now = Date.parse('2026-04-12T14:00:00.000Z');

  it('marks Redis source as online', () => {
    const s: UserPresenceEntry = {
      status: 'ok',
      source: 'redis',
      lastSeenAt: '2026-04-12T14:00:00.000Z',
    };
    expect(peerPresenceDisplay(s, now)).toEqual({
      text: 'Online',
      variant: 'online',
    });
  });

  it('shows stale relative time for MongoDB source', () => {
    const s: UserPresenceEntry = {
      status: 'ok',
      source: 'mongodb',
      lastSeenAt: '2026-04-12T13:50:00.000Z',
    };
    expect(peerPresenceDisplay(s, now)).toEqual({
      text: 'Last seen 10m ago',
      variant: 'stale',
    });
  });

  it('maps not_available', () => {
    const s: UserPresenceEntry = { status: 'not_available' };
    expect(peerPresenceDisplay(s, now).variant).toBe('unknown');
  });
});
