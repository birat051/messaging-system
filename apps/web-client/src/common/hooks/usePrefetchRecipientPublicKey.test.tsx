import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { createTestStore } from '@/common/test-utils';
import { usePrefetchRecipientPublicKey } from './usePrefetchRecipientPublicKey';

const prefetchMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/fetchRecipientPublicKey', () => ({
  prefetchRecipientPublicKey: (...args: unknown[]) => prefetchMock(...args),
  fetchRecipientPublicKeyForMessaging: vi.fn(),
  fetchRecipientPublicKeyWithCache: vi.fn(),
  RECIPIENT_NO_KEY_AVAILABLE_MESSAGE: '',
}));

describe('usePrefetchRecipientPublicKey', () => {
  it('calls prefetch when recipient id becomes set', () => {
    const store = createTestStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => {
        usePrefetchRecipientPublicKey(id);
      },
      { initialProps: { id: null as string | null }, wrapper },
    );

    expect(prefetchMock).not.toHaveBeenCalled();

    rerender({ id: 'recipient-a' });
    expect(prefetchMock).toHaveBeenCalledWith(
      expect.any(Function),
      'recipient-a',
    );

    rerender({ id: 'recipient-b' });
    expect(prefetchMock).toHaveBeenCalledWith(
      expect.any(Function),
      'recipient-b',
    );
  });
});
