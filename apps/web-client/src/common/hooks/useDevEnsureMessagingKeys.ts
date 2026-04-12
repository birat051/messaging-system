import { useCallback } from 'react';
import { ensureUserKeypairReadyForMessaging } from '../crypto/ensureMessagingKeypair';
import { useAppDispatch } from '@/store/hooks';
import { useAuth } from './useAuth';

/**
 * **Development builds only** — call **`ensureKeys()`** from a throwaway button or DevTools to force
 * **`ensureUserKeypairReadyForMessaging`** without sending a message. Production builds throw.
 */
export function useDevEnsureMessagingKeys(): {
  ensureKeys: () => Promise<void>;
} {
  const { user } = useAuth();
  const dispatch = useAppDispatch();

  const ensureKeys = useCallback(async () => {
    if (!import.meta.env.DEV) {
      throw new Error('useDevEnsureMessagingKeys is only for development builds.');
    }
    const id = user?.id;
    if (!id?.trim()) {
      throw new Error('Sign in first.');
    }
    await ensureUserKeypairReadyForMessaging(id, dispatch);
  }, [dispatch, user?.id]);

  return { ensureKeys };
}
