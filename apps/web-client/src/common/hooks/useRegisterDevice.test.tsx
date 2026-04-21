import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMyDevice } from '@/common/api/usersApi';
import { createTestStore } from '@/common/test-utils';
import { useRegisterDevice } from './useRegisterDevice';

vi.mock('@/common/api/usersApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/api/usersApi')>();
  return {
    ...actual,
    registerMyDevice: vi.fn(),
  };
});

describe('useRegisterDevice', () => {
  const registerMock = vi.mocked(registerMyDevice);

  beforeEach(() => {
    vi.clearAllMocks();
    registerMock.mockResolvedValue({
      deviceId: 'dev-1',
      publicKey: 'spki',
      keyVersion: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
  });

  function wrapperFor(store: ReturnType<typeof createTestStore>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <Provider store={store}>{children}</Provider>;
    };
  }

  it('dispatches registerDevice thunk (POST /users/me/devices) and exposes crypto slice fields', async () => {
    const store = createTestStore();
    const { result } = renderHook(() => useRegisterDevice(), {
      wrapper: wrapperFor(store),
    });

    expect(result.current.keyRegistered).toBe(false);
    expect(result.current.status).toBe('idle');

    void result.current.registerDevice({ publicKey: 'spki' });

    await waitFor(() => {
      expect(store.getState().crypto.registeredOnServer).toBe(true);
    });

    expect(registerMock).toHaveBeenCalledWith({ publicKey: 'spki' });
    expect(store.getState().crypto.deviceId).toBe('dev-1');
    expect(store.getState().crypto.keyVersion).toBe(1);
    expect(result.current.keyRegistered).toBe(true);
    expect(result.current.deviceId).toBe('dev-1');
    expect(result.current.keyVersion).toBe(1);
    expect(result.current.status).toBe('succeeded');
  });
});
