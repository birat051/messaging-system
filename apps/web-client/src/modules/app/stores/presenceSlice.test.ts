import { describe, expect, it } from 'vitest';
import { authReducer, logout } from '@/modules/auth/stores/authSlice';
import { configureStore } from '@reduxjs/toolkit';
import {
  presenceClearedForUser,
  presenceReducer,
  presenceUserError,
  presenceUserFromResult,
  presenceUserLoading,
} from './presenceSlice';

describe('presenceSlice', () => {
  it('tracks loading and resolved ok', () => {
    const store = configureStore({ reducer: { presence: presenceReducer } });
    store.dispatch(presenceUserLoading({ userId: 'u1' }));
    expect(store.getState().presence.byUserId.u1).toEqual({
      status: 'loading',
    });
    store.dispatch(
      presenceUserFromResult({
        userId: 'u1',
        result: {
          status: 'ok',
          source: 'redis',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
    expect(store.getState().presence.byUserId.u1).toEqual({
      status: 'ok',
      source: 'redis',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('clears one user', () => {
    const store = configureStore({ reducer: { presence: presenceReducer } });
    store.dispatch(
      presenceUserFromResult({
        userId: 'a',
        result: { status: 'not_available' },
      }),
    );
    store.dispatch(presenceClearedForUser({ userId: 'a' }));
    expect(store.getState().presence.byUserId.a).toBeUndefined();
  });

  it('resets on logout', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer,
        presence: presenceReducer,
      },
    });
    store.dispatch(
      presenceUserError({ userId: 'x', message: 'e' }),
    );
    store.dispatch(logout());
    expect(store.getState().presence.byUserId).toEqual({});
  });
});
