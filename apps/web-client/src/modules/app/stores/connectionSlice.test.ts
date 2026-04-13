import { describe, expect, it } from 'vitest';
import { setPresenceStatus, connectionReducer } from './connectionSlice';
import {
  selectConnectionPresenceStatus,
  selectSocketIoLifecycle,
} from './connectionSelectors';
import type { RootState } from '@/store/store';

describe('connectionSlice', () => {
  it('sets presence status', () => {
    const next = connectionReducer(
      undefined,
      setPresenceStatus({ kind: 'connected', socketId: 'abc' }),
    );
    expect(next.presenceStatus).toEqual({ kind: 'connected', socketId: 'abc' });
  });
});

describe('connectionSelectors', () => {
  const base = {
    connection: { presenceStatus: { kind: 'idle' as const } },
    auth: { user: null as null, accessToken: null as null },
  };

  it('selectConnectionPresenceStatus', () => {
    const state = {
      ...base,
      connection: { presenceStatus: { kind: 'disconnected' as const, reason: 'x' } },
    } as unknown as RootState;
    expect(selectConnectionPresenceStatus(state)).toEqual({
      kind: 'disconnected',
      reason: 'x',
    });
  });

  it('selectSocketIoLifecycle returns null without user', () => {
    const state = {
      ...base,
      connection: { presenceStatus: { kind: 'connected' as const, socketId: 's' } },
    } as unknown as RootState;
    expect(selectSocketIoLifecycle(state)).toBeNull();
  });

  it('selectSocketIoLifecycle maps when user is present', () => {
    const state = {
      ...base,
      auth: {
        user: { id: 'user-1' },
        accessToken: null,
      },
      connection: { presenceStatus: { kind: 'connecting' as const } },
    } as unknown as RootState;
    expect(selectSocketIoLifecycle(state)).toBe('connecting');
  });
});
