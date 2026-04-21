import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestStore } from '@/common/test-utils';
import { useDevicePublicKeys } from './useDevicePublicKeys';

const listUserDevicePublicKeys = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    items: [{ deviceId: 'd1', publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' }],
  }),
);

vi.mock('@/common/api/usersApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/common/api/usersApi')>();
  return {
    ...actual,
    listUserDevicePublicKeys: (userId: string) =>
      listUserDevicePublicKeys(userId),
  };
});

function wrapper(store: ReturnType<typeof createTestStore>) {
  return function W({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

describe('useDevicePublicKeys', () => {
  beforeEach(() => {
    listUserDevicePublicKeys.mockClear();
  });

  it('returns empty when userId is absent', () => {
    const store = createTestStore();
    const { result } = renderHook(() => useDevicePublicKeys(null), {
      wrapper: wrapper(store),
    });
    expect(result.current.cacheKey).toBe('');
    expect(result.current.items).toEqual([]);
    expect(listUserDevicePublicKeys).not.toHaveBeenCalled();
  });

  it('fetches and exposes device rows for a user id', async () => {
    const store = createTestStore({
      auth: { user: null, accessToken: 't' },
    });
    const { result } = renderHook(() => useDevicePublicKeys('peer-99'), {
      wrapper: wrapper(store),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(listUserDevicePublicKeys).toHaveBeenCalledWith('peer-99');
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.deviceId).toBe('d1');
    expect(result.current.isFresh).toBe(true);
  });

  it('refresh invalidates then refetches', async () => {
    const store = createTestStore({
      auth: { user: null, accessToken: 't' },
    });
    const { result } = renderHook(() => useDevicePublicKeys('u1'), {
      wrapper: wrapper(store),
    });

    await waitFor(() => expect(result.current.isFresh).toBe(true));
    expect(listUserDevicePublicKeys).toHaveBeenCalledTimes(1);

    result.current.refresh();

    await waitFor(() => {
      expect(listUserDevicePublicKeys.mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
    });
  });
});
