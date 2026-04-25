import { describe, expect, it } from 'vitest';
import { logout } from '@/modules/auth/stores/authSlice';
import { registerDevice } from './cryptoSlice';
import {
  devicePublicKeysInitialState,
  devicePublicKeysReducer,
  fetchDevicePublicKeys,
  invalidateDevicePublicKeys,
  isDevicePublicKeysCacheFresh,
} from './devicePublicKeysSlice';

describe('devicePublicKeysReducer', () => {
  it('logout clears cache', () => {
    const state = devicePublicKeysReducer(
      {
        ...devicePublicKeysInitialState,
        byUserId: {
          me: {
            status: 'succeeded',
            items: [{ deviceId: 'x', publicKey: 'pk' }],
            forbidden: false,
            error: null,
            cachedAtMs: Date.now(),
          },
        },
      },
      logout(),
    );
    expect(state.byUserId).toEqual({});
  });

  it('invalidateDevicePublicKeys removes one user or all', () => {
    let state = devicePublicKeysReducer(
      {
        ...devicePublicKeysInitialState,
        byUserId: {
          a: {
            status: 'succeeded',
            items: [],
            forbidden: false,
            error: null,
            cachedAtMs: 1,
          },
          b: {
            status: 'succeeded',
            items: [],
            forbidden: false,
            error: null,
            cachedAtMs: 2,
          },
        },
      },
      invalidateDevicePublicKeys('a'),
    );
    expect(state.byUserId.a).toBeUndefined();
    expect(state.byUserId.b).toBeDefined();

    state = devicePublicKeysReducer(state, invalidateDevicePublicKeys(undefined));
    expect(state.byUserId).toEqual({});
  });

  it('isDevicePublicKeysCacheFresh respects TTL', () => {
    const now = 1_000_000;
    const entry = {
      status: 'succeeded' as const,
      items: [],
      forbidden: false,
      error: null,
      cachedAtMs: now - 1000,
    };
    expect(isDevicePublicKeysCacheFresh(entry, now)).toBe(true);
    expect(
      isDevicePublicKeysCacheFresh(
        { ...entry, cachedAtMs: now - 200_000 },
        now,
      ),
    ).toBe(false);
  });
});

describe('fetchDevicePublicKeys thunk', () => {
  it('has expected type prefix', () => {
    expect(fetchDevicePublicKeys.typePrefix).toBe('devicePublicKeys/fetch');
  });
});

describe('registerDevice integration', () => {
  it('registerDevice.fulfilled clears cached me row', () => {
    const state = devicePublicKeysReducer(
      {
        ...devicePublicKeysInitialState,
        byUserId: {
          me: {
            status: 'succeeded',
            items: [{ deviceId: 'd1', publicKey: 'pk' }],
            forbidden: false,
            error: null,
            cachedAtMs: Date.now(),
          },
        },
      },
      registerDevice.fulfilled(
        {
          deviceId: 'd1',
          publicKey: 'pk',
          keyVersion: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        'rid',
        { publicKey: 'pk' },
      ),
    );
    expect(state.byUserId.me).toBeUndefined();
  });
});
