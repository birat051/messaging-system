import axios, { type AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listUserDevicePublicKeys, registerMyDevice } from '@/common/api/usersApi';
import { createTestStore } from '@/common/test-utils';
import { evaluateDeviceSyncBootstrapState } from './deviceBootstrapSync';
import { ensureUserKeypairReadyForMessaging } from './ensureMessagingKeypair';

const FIXED_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

vi.mock('@/common/api/usersApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/api/usersApi')>();
  return {
    ...actual,
    listUserDevicePublicKeys: vi.fn(),
    registerMyDevice: vi.fn(),
  };
});

vi.mock('./deviceBootstrapSync', () => ({
  evaluateDeviceSyncBootstrapState: vi.fn().mockResolvedValue('idle'),
}));

const listKeyringVersions = vi.fn();
const getStoredDeviceId = vi.fn();
const getKeyringPublicSpkiOptional = vi.fn();
const setStoredDeviceId = vi.fn();
const storeKeyringPrivateKeyPkcs8 = vi.fn();

vi.mock('./privateKeyStorage', () => ({
  DEFAULT_SINGLE_DEVICE_ID: 'default',
  getStoredDeviceId: (...a: unknown[]) => getStoredDeviceId(...a),
  listKeyringVersions: (...a: unknown[]) => listKeyringVersions(...a),
  getKeyringPublicSpkiOptional: (...a: unknown[]) =>
    getKeyringPublicSpkiOptional(...a),
  setStoredDeviceId: (...a: unknown[]) => setStoredDeviceId(...a),
  storeKeyringPrivateKeyPkcs8: (...a: unknown[]) =>
    storeKeyringPrivateKeyPkcs8(...a),
}));

vi.mock('./deviceMessagingPassphrase', () => ({
  getOrCreateDeviceScopedPassphrase: () => 'passphrase',
}));

vi.mock('./secureContext', () => ({
  assertSecureContextForPrivateKeyOps: vi.fn(),
}));

const mockPubKey = {} as CryptoKey;
const mockPrivKey = {} as CryptoKey;

vi.mock('./keypair', () => ({
  generateP256EcdhKeyPair: vi.fn(async () => ({
    publicKey: mockPubKey,
    privateKey: mockPrivKey,
  })),
  exportPublicKeySpkiBase64: vi.fn(async () => 'mock-spki-b64'),
  exportPrivateKeyPkcs8Base64: vi.fn(async () => 'YWFhYQ=='),
}));

const storeHolder = vi.hoisted(() => ({
  getState: (): ReturnType<
    typeof import('@/store/store').store.getState
  > => {
    throw new Error('storeHolder.getState must be set in test');
  },
}));

vi.mock('@/store/store', () => ({
  store: {
    getState: () => storeHolder.getState(),
  },
}));

function axios404(): AxiosError {
  return new axios.AxiosError(
    'Not found',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 404,
      statusText: 'Not Found',
      data: { code: 'NOT_FOUND', message: 'Not found' },
      headers: {},
      config: {} as never,
    },
  );
}

describe('ensureUserKeypairReadyForMessaging', () => {
  const userId = 'user-1';
  const listMock = vi.mocked(listUserDevicePublicKeys);
  const registerMock = vi.mocked(registerMyDevice);

  beforeEach(() => {
    vi.clearAllMocks();
    getStoredDeviceId.mockResolvedValue(undefined);
    listKeyringVersions.mockResolvedValue([]);
    listMock.mockResolvedValue({ items: [] });
    registerMock.mockResolvedValue({
      deviceId: FIXED_UUID,
      publicKey: 'mock-spki-b64',
      keyVersion: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(FIXED_UUID);
  });

  it('new browser + account already has devices on server: registers this browser and evaluates sync bootstrap', async () => {
    listMock.mockResolvedValue({
      items: [
        {
          deviceId: 'already-on-server',
          publicKey: 'pk-other',
          keyVersion: 1,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const testStore = createTestStore();
    storeHolder.getState = () => testStore.getState();

    await ensureUserKeypairReadyForMessaging(userId, testStore.dispatch);

    expect(registerMock).toHaveBeenCalledWith({
      publicKey: 'mock-spki-b64',
      deviceId: FIXED_UUID,
    });
    expect(evaluateDeviceSyncBootstrapState).toHaveBeenCalled();
  });

  it('IDB deviceId does not appear on server + empty keyring: registers fresh device (stale/orphan identity)', async () => {
    getStoredDeviceId.mockResolvedValue('orphan-local-only');
    listMock.mockResolvedValue({
      items: [
        {
          deviceId: 'remote-only',
          publicKey: 'pk-remote',
          keyVersion: 1,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const testStore = createTestStore();
    storeHolder.getState = () => testStore.getState();

    await ensureUserKeypairReadyForMessaging(userId, testStore.dispatch);

    expect(registerMock).toHaveBeenCalledWith({
      publicKey: 'mock-spki-b64',
      deviceId: FIXED_UUID,
    });
  });

  it('IDB deviceId matches server row but keyring empty: backup error (lost key material)', async () => {
    getStoredDeviceId.mockResolvedValue('lost-keys-dev');
    listMock.mockResolvedValue({
      items: [
        {
          deviceId: 'lost-keys-dev',
          publicKey: 'pk-remote',
          keyVersion: 1,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const testStore = createTestStore();
    storeHolder.getState = () => testStore.getState();

    await expect(
      ensureUserKeypairReadyForMessaging(userId, testStore.dispatch),
    ).rejects.toThrow(/no key material/i);

    expect(registerMock).not.toHaveBeenCalled();
  });

  it('on first device: generates P-256 pair, assigns UUID, hydrates cryptoSlice, registers with deviceId, persists', async () => {
    const testStore = createTestStore();
    storeHolder.getState = () => testStore.getState();

    await ensureUserKeypairReadyForMessaging(userId, testStore.dispatch);

    expect(registerMock).toHaveBeenCalledWith({
      publicKey: 'mock-spki-b64',
      deviceId: FIXED_UUID,
    });
    expect(testStore.getState().crypto.deviceId).toBe(FIXED_UUID);
    expect(setStoredDeviceId).toHaveBeenCalledWith(userId, FIXED_UUID);
    expect(storeKeyringPrivateKeyPkcs8).toHaveBeenCalledWith(
      userId,
      1,
      expect.any(ArrayBuffer),
      'passphrase',
      { publicKeySpkiB64: 'mock-spki-b64' },
    );
    expect(evaluateDeviceSyncBootstrapState).toHaveBeenCalledWith(
      testStore.dispatch,
      FIXED_UUID,
      expect.any(Object),
    );
  });

  it('treats GET …/devices/public-keys 404 as empty directory so first-device registration still runs', async () => {
    listMock.mockRejectedValueOnce(axios404());
    const testStore = createTestStore();
    storeHolder.getState = () => testStore.getState();

    await ensureUserKeypairReadyForMessaging(userId, testStore.dispatch);

    expect(registerMock).toHaveBeenCalledWith({
      publicKey: 'mock-spki-b64',
      deviceId: FIXED_UUID,
    });
  });

  it('on 404 with local keyring: re-registers via POST with stored deviceId and public key', async () => {
    listMock.mockRejectedValueOnce(axios404());
    listKeyringVersions.mockResolvedValue([1]);
    getKeyringPublicSpkiOptional.mockResolvedValue('local-spki-b64');
    getStoredDeviceId.mockResolvedValue('persisted-dev-id');
    registerMock.mockResolvedValue({
      deviceId: 'persisted-dev-id',
      publicKey: 'local-spki-b64',
      keyVersion: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    const testStore = createTestStore();
    storeHolder.getState = () => testStore.getState();

    await ensureUserKeypairReadyForMessaging(userId, testStore.dispatch);

    expect(registerMock).toHaveBeenCalledWith({
      publicKey: 'local-spki-b64',
      deviceId: 'persisted-dev-id',
    });
    expect(setStoredDeviceId).toHaveBeenCalledWith(userId, 'persisted-dev-id');
    expect(testStore.getState().crypto.deviceId).toBe('persisted-dev-id');
  });
});
