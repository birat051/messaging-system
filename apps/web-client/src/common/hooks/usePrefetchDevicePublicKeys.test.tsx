import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { createTestStore } from '@/common/test-utils/renderWithProviders';
import { listUserDevicePublicKeys } from '@/common/api/usersApi';
import { usePrefetchDevicePublicKeys } from './usePrefetchDevicePublicKeys';

vi.mock('@/common/api/usersApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/common/api/usersApi')>();
  return {
    ...actual,
    listUserDevicePublicKeys: vi.fn().mockResolvedValue({ items: [] }),
  };
});

describe('usePrefetchDevicePublicKeys', () => {
  it('requests device public keys for the peer and for me', async () => {
    const store = createTestStore();
    renderHook(() => usePrefetchDevicePublicKeys('user-peer-1'), {
      wrapper: ({ children }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });

    await waitFor(() => {
      expect(listUserDevicePublicKeys).toHaveBeenCalledWith('user-peer-1');
      expect(listUserDevicePublicKeys).toHaveBeenCalledWith('me');
    });
  });

  it('does nothing when recipient id is empty', () => {
    vi.mocked(listUserDevicePublicKeys).mockClear();
    const store = createTestStore();
    renderHook(() => usePrefetchDevicePublicKeys(null), {
      wrapper: ({ children }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });
    expect(listUserDevicePublicKeys).not.toHaveBeenCalled();
  });
});
