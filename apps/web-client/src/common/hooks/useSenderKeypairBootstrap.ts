import { useEffect, useLayoutEffect, useState } from 'react';
import { ensureUserKeypairReadyForMessaging } from '../crypto/ensureMessagingKeypair';
import { isSecureContext } from '../crypto/secureContext';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

/**
 * After **`sessionReady`** (e.g. **`bootstrapSessionIfNeeded`** finished), blocks until the
 * signed-in user’s messaging keypair exists locally and matches the directory (**`ensureUserKeypairReadyForMessaging`**),
 * or until no bootstrap is needed (no session, or non–secure context where E2EE cannot run).
 *
 * Uses **`useLayoutEffect`** so we do not paint **`children`** for one frame before the “preparing encryption” gate.
 */
export function useSenderKeypairBootstrap(sessionReady: boolean): boolean {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((s) => s.auth.user?.id?.trim() ?? '');
  const needsSecureKeypair = Boolean(
    sessionReady && userId.length > 0 && isSecureContext(),
  );
  const [gateOpen, setGateOpen] = useState(false);

  useLayoutEffect(() => {
    if (!needsSecureKeypair) {
      setGateOpen(true);
      return;
    }
    setGateOpen(false);
  }, [needsSecureKeypair, userId]);

  useEffect(() => {
    if (!needsSecureKeypair) {
      return;
    }
    let cancelled = false;
    void ensureUserKeypairReadyForMessaging(userId, dispatch).finally(
      () => {
        if (!cancelled) {
          setGateOpen(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [needsSecureKeypair, userId, dispatch]);

  return sessionReady && gateOpen;
}
