import { configureStore } from '@reduxjs/toolkit';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import * as usersApi from '@/common/api/usersApi';
import {
  cryptoReducer,
  setSyncState,
} from '@/modules/crypto/stores/cryptoSlice';
import {
  evaluateDeviceSyncBootstrapState,
  messageHasDeviceWrappedKey,
} from './deviceBootstrapSync';

vi.mock('@/common/api/usersApi', () => ({
  listMyDevices: vi.fn(),
  listMySyncMessageKeys: vi.fn(),
}));

const listMyDevices = vi.mocked(usersApi.listMyDevices);
const listMySyncMessageKeys = vi.mocked(usersApi.listMySyncMessageKeys);

describe('messageHasDeviceWrappedKey', () => {
  it('returns true only for non-empty wrapped key string', () => {
    expect(
      messageHasDeviceWrappedKey(
        { encryptedMessageKeys: { d1: 'abc' } },
        'd1',
      ),
    ).toBe(true);
    expect(
      messageHasDeviceWrappedKey({ encryptedMessageKeys: { d1: '  ' } }, 'd1'),
    ).toBe(false);
    expect(messageHasDeviceWrappedKey({ encryptedMessageKeys: {} }, 'd1')).toBe(
      false,
    );
    expect(messageHasDeviceWrappedKey({}, 'd1')).toBe(false);
  });
});

describe('evaluateDeviceSyncBootstrapState', () => {
  beforeEach(() => {
    listMyDevices.mockReset();
    listMySyncMessageKeys.mockReset();
  });

  function makeStore() {
    return configureStore({ reducer: { crypto: cryptoReducer } });
  }

  it('sets idle when only one device is registered', async () => {
    listMyDevices.mockResolvedValue({
      items: [
        {
          deviceId: 'a',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-a',
        },
      ],
    });
    listMySyncMessageKeys.mockResolvedValue({
      items: [],
      hasMore: false,
      nextAfterMessageId: null,
    });
    const store = makeStore();
    const out = await evaluateDeviceSyncBootstrapState(store.dispatch, 'a');
    expect(out).toBe('idle');
    expect(store.getState().crypto.syncState).toBe('idle');
    expect(listMySyncMessageKeys).not.toHaveBeenCalled();
  });

  it('sets complete when in_progress and wrapped keys appear', async () => {
    listMyDevices.mockResolvedValue({
      items: [
        {
          deviceId: 'a',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-a',
        },
        {
          deviceId: 'b',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-b',
        },
      ],
    });
    listMySyncMessageKeys.mockResolvedValue({
      items: [{ messageId: 'm1', encryptedMessageKey: 'x' }],
      hasMore: false,
      nextAfterMessageId: null,
    });
    const store = makeStore();
    store.dispatch(setSyncState('in_progress'));
    const onHistoryMayDecryptNow = vi.fn();
    const out = await evaluateDeviceSyncBootstrapState(store.dispatch, 'b', {
      getState: () => store.getState().crypto,
      onHistoryMayDecryptNow,
    });
    expect(out).toBe('complete');
    expect(store.getState().crypto.syncState).toBe('complete');
    expect(onHistoryMayDecryptNow).toHaveBeenCalledTimes(1);
  });

  it('sets complete when awaiting sync and sync returns a wrapped key', async () => {
    listMyDevices.mockResolvedValue({
      items: [
        {
          deviceId: 'a',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-a',
        },
        {
          deviceId: 'b',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-b',
        },
      ],
    });
    listMySyncMessageKeys.mockResolvedValue({
      items: [{ messageId: 'm1', encryptedMessageKey: 'x' }],
      hasMore: false,
      nextAfterMessageId: null,
    });
    const store = makeStore();
    store.dispatch(setSyncState('pending'));
    const onHistoryMayDecryptNow = vi.fn();
    const out = await evaluateDeviceSyncBootstrapState(store.dispatch, 'b', {
      getState: () => store.getState().crypto,
      onHistoryMayDecryptNow,
    });
    expect(out).toBe('complete');
    expect(store.getState().crypto.syncState).toBe('complete');
    expect(onHistoryMayDecryptNow).toHaveBeenCalledTimes(1);
  });

  it('sets idle when multiple devices and sync returns a wrapped key', async () => {
    listMyDevices.mockResolvedValue({
      items: [
        {
          deviceId: 'a',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-a',
        },
        {
          deviceId: 'b',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-b',
        },
      ],
    });
    listMySyncMessageKeys.mockResolvedValue({
      items: [{ messageId: 'm1', encryptedMessageKey: 'x' }],
      hasMore: true,
      nextAfterMessageId: 'm1',
    });
    const store = makeStore();
    const out = await evaluateDeviceSyncBootstrapState(store.dispatch, 'b');
    expect(out).toBe('idle');
    expect(store.getState().crypto.syncState).toBe('idle');
  });

  it('keeps in_progress when multiple devices and no wrapped keys yet', async () => {
    listMyDevices.mockResolvedValue({
      items: [
        {
          deviceId: 'a',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-a',
        },
        {
          deviceId: 'b',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-b',
        },
      ],
    });
    listMySyncMessageKeys.mockResolvedValue({
      items: [],
      hasMore: false,
      nextAfterMessageId: null,
    });
    const store = makeStore();
    store.dispatch(setSyncState('in_progress'));
    const out = await evaluateDeviceSyncBootstrapState(store.dispatch, 'b', {
      getState: () => store.getState().crypto,
    });
    expect(out).toBe('in_progress');
    expect(store.getState().crypto.syncState).toBe('in_progress');
  });

  it('sets pending when multiple devices and no wrapped keys on first sync page', async () => {
    listMyDevices.mockResolvedValue({
      items: [
        {
          deviceId: 'a',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-a',
        },
        {
          deviceId: 'b',
          deviceLabel: null,
          createdAt: '',
          lastSeenAt: '',
          publicKey: 'pk-b',
        },
      ],
    });
    listMySyncMessageKeys.mockResolvedValue({
      items: [],
      hasMore: false,
      nextAfterMessageId: null,
    });
    const store = makeStore();
    const out = await evaluateDeviceSyncBootstrapState(store.dispatch, 'b');
    expect(out).toBe('pending');
    expect(store.getState().crypto.syncState).toBe('pending');
    expect(listMySyncMessageKeys).toHaveBeenCalledWith({
      deviceId: 'b',
      limit: 1,
    });
  });

  it('sets idle on API failure', async () => {
    listMyDevices.mockRejectedValue(new Error('network'));
    const store = makeStore();
    const out = await evaluateDeviceSyncBootstrapState(store.dispatch, 'b');
    expect(out).toBe('idle');
    expect(store.getState().crypto.syncState).toBe('idle');
  });

  it('treats blank deviceId as idle', async () => {
    const store = makeStore();
    const out = await evaluateDeviceSyncBootstrapState(store.dispatch, '  ');
    expect(out).toBe('idle');
    expect(listMyDevices).not.toHaveBeenCalled();
  });
});
