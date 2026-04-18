import { describe, expect, it } from 'vitest';
import { createTestStore } from '@/common/test-utils';
import { PRESENCE_IDLE_ENTRY } from './presenceTypes';
import {
  selectHasPeerPresenceHint,
  selectIsPeerOnline,
  selectUserPresenceEntry,
} from './presenceSelectors';

describe('presenceSelectors', () => {
  it('selectIsPeerOnline is true only for Redis ok', () => {
    const store = createTestStore({
      presence: {
        byUserId: {
          a: {
            status: 'ok',
            source: 'redis',
            lastSeenAt: '2026-01-01T00:00:00.000Z',
          },
          b: {
            status: 'ok',
            source: 'mongodb',
            lastSeenAt: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    });
    const s = store.getState();
    expect(selectIsPeerOnline(s, 'a')).toBe(true);
    expect(selectIsPeerOnline(s, 'b')).toBe(false);
    expect(selectIsPeerOnline(s, null)).toBe(false);
  });

  it('selectHasPeerPresenceHint excludes idle/loading', () => {
    const store = createTestStore({
      presence: {
        byUserId: {
          x: { status: 'loading' },
          y: { status: 'not_available' },
        },
      },
    });
    const s = store.getState();
    expect(selectHasPeerPresenceHint(s, 'x')).toBe(false);
    expect(selectHasPeerPresenceHint(s, 'y')).toBe(true);
  });

  it('selectUserPresenceEntry defaults to idle', () => {
    const store = createTestStore();
    expect(selectUserPresenceEntry(store.getState(), 'missing')).toBe(
      PRESENCE_IDLE_ENTRY,
    );
  });
});
