import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePrefetchRecipientPublicKey } from './usePrefetchRecipientPublicKey';

const prefetchMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/fetchRecipientPublicKey', () => ({
  prefetchRecipientPublicKey: (...args: unknown[]) => prefetchMock(...args),
  fetchRecipientPublicKeyForMessaging: vi.fn(),
  RECIPIENT_NO_KEY_AVAILABLE_MESSAGE: '',
}));

describe('usePrefetchRecipientPublicKey', () => {
  it('calls prefetch when recipient id becomes set', () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => {
        usePrefetchRecipientPublicKey(id);
      },
      { initialProps: { id: null as string | null } },
    );

    expect(prefetchMock).not.toHaveBeenCalled();

    rerender({ id: 'recipient-a' });
    expect(prefetchMock).toHaveBeenCalledWith('recipient-a');

    rerender({ id: 'recipient-b' });
    expect(prefetchMock).toHaveBeenCalledWith('recipient-b');
  });
});
