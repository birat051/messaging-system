import { describe, expect, it } from 'vitest';
import { logout } from '@/modules/auth/stores/authSlice';
import {
  cryptoReducer,
  deviceRegistered,
  hydrateMessagingDeviceId,
  setSyncState,
  syncCompleted,
  syncDismissed,
  syncRequested,
  syncStarted,
} from './cryptoSlice';

describe('cryptoReducer hydrateMessagingDeviceId', () => {
  it('sets deviceId from non-empty string', () => {
    const state = cryptoReducer(undefined, hydrateMessagingDeviceId('dev-1'));
    expect(state.deviceId).toBe('dev-1');
  });

  it('ignores blank payload', () => {
    const state = cryptoReducer(undefined, hydrateMessagingDeviceId('  '));
    expect(state.deviceId).toBeNull();
  });
});

describe('cryptoReducer syncState', () => {
  it('setSyncState updates syncState', () => {
    const state = cryptoReducer(undefined, setSyncState('pending'));
    expect(state.syncState).toBe('pending');
  });

  it('logout resets syncState', () => {
    let state = cryptoReducer(undefined, setSyncState('in_progress'));
    expect(state.syncState).toBe('in_progress');
    state = cryptoReducer(state, logout());
    expect(state.syncState).toBe('idle');
  });
});

describe('cryptoReducer syncStarted', () => {
  it('moves pending to in_progress', () => {
    let state = cryptoReducer(undefined, setSyncState('pending'));
    state = cryptoReducer(state, syncStarted());
    expect(state.syncState).toBe('in_progress');
  });

  it('does not change syncState when not pending', () => {
    let state = cryptoReducer(undefined, setSyncState('idle'));
    state = cryptoReducer(state, syncStarted());
    expect(state.syncState).toBe('idle');
  });
});

describe('cryptoReducer pending sync', () => {
  const payload = {
    newDeviceId: 'dev-new',
    newDevicePublicKey: 'spki-base64',
  };

  it('syncRequested stores pending ids', () => {
    const state = cryptoReducer(undefined, syncRequested(payload));
    expect(state.pendingSyncFromDeviceId).toBe('dev-new');
    expect(state.pendingSyncFromDevicePublicKey).toBe('spki-base64');
  });

  it('syncDismissed clears pending fields', () => {
    let state = cryptoReducer(undefined, syncRequested(payload));
    state = cryptoReducer(state, syncDismissed());
    expect(state.pendingSyncFromDeviceId).toBeNull();
    expect(state.pendingSyncFromDevicePublicKey).toBeNull();
  });

  it('logout clears pending sync', () => {
    let state = cryptoReducer(undefined, syncRequested(payload));
    state = cryptoReducer(state, logout());
    expect(state.pendingSyncFromDeviceId).toBeNull();
    expect(state.pendingSyncFromDevicePublicKey).toBeNull();
  });
});

describe('cryptoReducer syncCompleted', () => {
  const payload = {
    newDeviceId: 'dev-new',
    newDevicePublicKey: 'spki-base64',
  };

  it('clears pending sync and stores newDeviceId', () => {
    let state = cryptoReducer(undefined, syncRequested(payload));
    state = cryptoReducer(state, syncCompleted({ newDeviceId: 'dev-new' }));
    expect(state.pendingSyncFromDeviceId).toBeNull();
    expect(state.pendingSyncFromDevicePublicKey).toBeNull();
    expect(state.syncCompletedForNewDeviceId).toBe('dev-new');
  });

  it('syncRequested clears prior syncCompletedForNewDeviceId', () => {
    let state = cryptoReducer(undefined, syncCompleted({ newDeviceId: 'old' }));
    expect(state.syncCompletedForNewDeviceId).toBe('old');
    state = cryptoReducer(
      state,
      syncRequested({
        newDeviceId: 'next',
        newDevicePublicKey: 'pk',
      }),
    );
    expect(state.syncCompletedForNewDeviceId).toBeNull();
    expect(state.pendingSyncFromDeviceId).toBe('next');
  });

  it('logout clears syncCompletedForNewDeviceId', () => {
    let state = cryptoReducer(undefined, syncCompleted({ newDeviceId: 'dev-x' }));
    expect(state.syncCompletedForNewDeviceId).toBe('dev-x');
    state = cryptoReducer(state, logout());
    expect(state.syncCompletedForNewDeviceId).toBeNull();
  });
});

describe('cryptoReducer deviceRegistered', () => {
  it('sets registered metadata', () => {
    const state = cryptoReducer(
      undefined,
      deviceRegistered({
        deviceId: 'd1',
        keyVersion: 2,
        publicKey: 'spki',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(state.registeredOnServer).toBe(true);
    expect(state.deviceId).toBe('d1');
    expect(state.keyVersion).toBe(2);
    expect(state.registeredPublicKeySpki).toBe('spki');
    expect(state.status).toBe('succeeded');
  });
});
