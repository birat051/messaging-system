import { useEffect, useLayoutEffect, useState } from 'react';
import { selectIsAuthenticated } from '@/modules/auth/stores/selectors';
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
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector((s) => s.auth.user?.id?.trim() ?? '');
  const needsSecureKeypair = Boolean(
    sessionReady &&
      isAuthenticated &&
      userId.length > 0 &&
      isSecureContext(),
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

  /**
   * When the tab becomes visible again, **silently** re-run directory alignment (**re-register** if the
   * server row for this browser was removed) — no Settings UI.
   */
  useEffect(() => {
    if (!needsSecureKeypair) {
      return;
    }
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        void ensureUserKeypairReadyForMessaging(userId, dispatch).catch(() => {
          /* non-fatal — decrypt/send paths surface their own errors */
        });
      }, 400);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(debounce);
    };
  }, [needsSecureKeypair, userId, dispatch]);

  return sessionReady && gateOpen;
}
