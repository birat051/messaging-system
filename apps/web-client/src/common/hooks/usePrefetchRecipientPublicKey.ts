import { useEffect } from 'react';
import { prefetchRecipientPublicKey } from '../utils/fetchRecipientPublicKey';
import { useAppDispatch } from '@/store/hooks';

/**
 * When **`recipientUserId`** changes (e.g. user picks a search row or opens a 1:1 thread), triggers a
 * best-effort directory key prefetch — see **`prefetchRecipientPublicKey`**.
 * Does not replace **`fetchRecipientPublicKeyWithCache`** on send (cache miss still fetches).
 */
export function usePrefetchRecipientPublicKey(
  recipientUserId: string | null | undefined,
): void {
  const dispatch = useAppDispatch();
  const id = recipientUserId?.trim() ?? '';

  useEffect(() => {
    if (!id) {
      return;
    }
    prefetchRecipientPublicKey(dispatch, id);
  }, [dispatch, id]);
}
