import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultMockUser } from '@/common/mocks/handlers';
import { createTestStore } from '@/common/test-utils';
import { useSenderKeypairBootstrap } from './useSenderKeypairBootstrap';

const ensureMock = vi.hoisted(() =>
  vi.fn(async () => {
    /* resolved after sender keypair bootstrap */
  }),
);

vi.mock('../crypto/ensureMessagingKeypair', () => ({
  ensureUserKeypairReadyForMessaging: ensureMock,
}));

describe('useSenderKeypairBootstrap', () => {
  beforeEach(() => {
    ensureMock.mockClear();
  });

  function createWrapper(store: ReturnType<typeof createTestStore>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <Provider store={store}>{children}</Provider>;
    };
  }

  it('returns false until sessionReady when no user is signed in', () => {
    const store = createTestStore();
    const { result, rerender } = renderHook(
      ({ sessionReady }: { sessionReady: boolean }) =>
        useSenderKeypairBootstrap(sessionReady),
      {
        wrapper: createWrapper(store),
        initialProps: { sessionReady: false },
      },
    );

    expect(result.current).toBe(false);
    rerender({ sessionReady: true });
    expect(result.current).toBe(true);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('runs ensureUserKeypairReadyForMessaging when session is ready and user is signed in', async () => {
    const store = createTestStore({
      auth: {
        user: { ...defaultMockUser, emailVerified: true },
        accessToken: 't',
      },
    });

    const { result, rerender } = renderHook(
      ({ sessionReady }: { sessionReady: boolean }) =>
        useSenderKeypairBootstrap(sessionReady),
      {
        wrapper: createWrapper(store),
        initialProps: { sessionReady: false },
      },
    );

    expect(result.current).toBe(false);
    rerender({ sessionReady: true });
    expect(result.current).toBe(false);

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(ensureMock).toHaveBeenCalledWith(
      defaultMockUser.id,
      expect.any(Function),
    );
  });
});
