import axios, { type AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RootState } from '@/store/store';
import { setRecipientDirectoryKey } from '@/modules/home/stores/messagingSlice';
import { getUserPublicKeyById } from '../api/usersApi';
import {
  fetchRecipientPublicKeyForMessaging,
  fetchRecipientPublicKeyWithCache,
  prefetchRecipientPublicKey,
  RECIPIENT_NO_KEY_AVAILABLE_MESSAGE,
} from './fetchRecipientPublicKey';

vi.mock('../api/usersApi', () => ({
  getUserPublicKeyById: vi.fn(),
}));

const sampleKey = {
  userId: 'peer-1',
  publicKey:
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEeWtZ0jiCzy6i7c1fhDNcct9WUer1FC9027TeJwYmimeYcCDeAauszT90CsuigDh12qwCJ3yFUDcZurT22BWJrJA',
  keyVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function axios404(): AxiosError {
  return new axios.AxiosError(
    'Not found',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 404,
      statusText: 'Not Found',
      data: { code: 'NOT_FOUND', message: 'No public key registered' },
      headers: {},
      config: {} as never,
    },
  );
}

function axios503(): AxiosError {
  return new axios.AxiosError(
    'Bad gateway',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      status: 503,
      statusText: 'Service Unavailable',
      data: { code: 'UNAVAILABLE', message: 'Try again' },
      headers: {},
      config: {} as never,
    },
  );
}

function axios400(): AxiosError {
  return new axios.AxiosError(
    'Bad request',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 400,
      statusText: 'Bad Request',
      data: { code: 'BAD_REQUEST', message: 'Invalid id' },
      headers: {},
      config: {} as never,
    },
  );
}

describe('fetchRecipientPublicKeyForMessaging', () => {
  beforeEach(() => {
    vi.mocked(getUserPublicKeyById).mockReset();
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (fn: Parameters<typeof setTimeout>[0]) => {
        if (typeof fn === 'function') {
          fn();
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns on first success', async () => {
    vi.mocked(getUserPublicKeyById).mockResolvedValue(sampleKey);

    await expect(
      fetchRecipientPublicKeyForMessaging('peer-1'),
    ).resolves.toEqual(sampleKey);
    expect(getUserPublicKeyById).toHaveBeenCalledTimes(1);
  });

  it('retries on 404 and succeeds when the key appears', async () => {
    vi.mocked(getUserPublicKeyById)
      .mockRejectedValueOnce(axios404())
      .mockRejectedValueOnce(axios404())
      .mockResolvedValueOnce(sampleKey);

    await expect(
      fetchRecipientPublicKeyForMessaging('peer-1'),
    ).resolves.toEqual(sampleKey);
    expect(getUserPublicKeyById).toHaveBeenCalledTimes(3);
  });

  it('retries on 503 then succeeds', async () => {
    vi.mocked(getUserPublicKeyById)
      .mockRejectedValueOnce(axios503())
      .mockResolvedValueOnce(sampleKey);

    await expect(
      fetchRecipientPublicKeyForMessaging('peer-1'),
    ).resolves.toEqual(sampleKey);
    expect(getUserPublicKeyById).toHaveBeenCalledTimes(2);
  });

  it('throws RECIPIENT_NO_KEY_AVAILABLE_MESSAGE after repeated 404s', async () => {
    vi.mocked(getUserPublicKeyById).mockRejectedValue(axios404());

    await expect(fetchRecipientPublicKeyForMessaging('peer-1')).rejects.toThrow(
      RECIPIENT_NO_KEY_AVAILABLE_MESSAGE,
    );
    expect(getUserPublicKeyById).toHaveBeenCalledTimes(5);
  });

  it('does not retry other 4xx errors', async () => {
    const err400 = axios400();
    vi.mocked(getUserPublicKeyById).mockRejectedValue(err400);

    await expect(fetchRecipientPublicKeyForMessaging('peer-1')).rejects.toBe(
      err400,
    );
    expect(getUserPublicKeyById).toHaveBeenCalledTimes(1);
  });
});

describe('fetchRecipientPublicKeyWithCache', () => {
  beforeEach(() => {
    vi.mocked(getUserPublicKeyById).mockReset();
  });

  it('returns cached key without calling the API', async () => {
    const dispatch = vi.fn();
    const getState = () =>
      ({
        messaging: {
          recipientDirectoryKeyByUserId: { 'peer-1': sampleKey },
        },
      }) as unknown as RootState;

    await expect(
      fetchRecipientPublicKeyWithCache('peer-1', getState, dispatch),
    ).resolves.toEqual(sampleKey);
    expect(getUserPublicKeyById).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fetches, dispatches setRecipientDirectoryKey, and returns when uncached', async () => {
    vi.mocked(getUserPublicKeyById).mockResolvedValue(sampleKey);
    const dispatch = vi.fn();
    const getState = () =>
      ({
        messaging: {
          recipientDirectoryKeyByUserId: {},
        },
      }) as unknown as RootState;

    await expect(
      fetchRecipientPublicKeyWithCache('peer-1', getState, dispatch),
    ).resolves.toEqual(sampleKey);
    expect(getUserPublicKeyById).toHaveBeenCalledWith('peer-1');
    expect(dispatch).toHaveBeenCalledWith(
      setRecipientDirectoryKey({ userId: 'peer-1', key: sampleKey }),
    );
  });
});

describe('prefetchRecipientPublicKey', () => {
  beforeEach(() => {
    vi.mocked(getUserPublicKeyById).mockReset();
    vi.mocked(getUserPublicKeyById).mockResolvedValue(sampleKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls getUserPublicKeyById once for a trimmed id and dispatches the key', async () => {
    const dispatch = vi.fn();
    prefetchRecipientPublicKey(dispatch, '  peer-1  ');
    expect(getUserPublicKeyById).toHaveBeenCalledWith('peer-1');
    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith(
        setRecipientDirectoryKey({ userId: 'peer-1', key: sampleKey }),
      );
    });
  });

  it('no-ops for null/empty id', () => {
    const dispatch = vi.fn();
    prefetchRecipientPublicKey(dispatch, null);
    prefetchRecipientPublicKey(dispatch, '');
    expect(getUserPublicKeyById).not.toHaveBeenCalled();
  });

  it('swallows rejection', async () => {
    const dispatch = vi.fn();
    vi.mocked(getUserPublicKeyById).mockRejectedValue(axios404());
    prefetchRecipientPublicKey(dispatch, 'peer-1');
    await vi.waitFor(() => {
      expect(getUserPublicKeyById).toHaveBeenCalled();
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
