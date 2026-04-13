import { useEffect } from 'react';
import { prefetchRecipientPublicKey } from '../utils/fetchRecipientPublicKey';

/**
 * When **`recipientUserId`** changes (e.g. user picks a search row or opens a 1:1 thread), triggers a
 * best-effort directory key prefetch — see **`prefetchRecipientPublicKey`**.
 * Does not replace **`fetchRecipientPublicKeyForMessaging`** on send.
 */
export function usePrefetchRecipientPublicKey(
  recipientUserId: string | null | undefined,
): void {
  const id = recipientUserId?.trim() ?? '';

  useEffect(() => {
    if (!id) {
      return;
    }
    prefetchRecipientPublicKey(id);
  }, [id]);
}
