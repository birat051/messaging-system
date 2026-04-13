import { type ReactNode, useEffect, useState } from 'react';
import { useSenderKeypairBootstrap } from '@/common/hooks/useSenderKeypairBootstrap';
import { useAppDispatch } from '../../../store/hooks';
import { bootstrapSessionIfNeeded } from '../utils/sessionBootstrap';

type Props = { children: ReactNode };

/**
 * Runs **`bootstrapSessionIfNeeded`** once on mount, then (when signed in on a **secure context**)
 * **`ensureUserKeypairReadyForMessaging`** so the sender’s key exists and is registered before the shell renders.
 * **`ProtectedRoute`** sees a restored access token when a refresh cookie/token exists.
 */
export function SessionRestore({ children }: Props) {
  const dispatch = useAppDispatch();
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void bootstrapSessionIfNeeded(dispatch).finally(() => {
      if (!cancelled) {
        setSessionReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const appReady = useSenderKeypairBootstrap(sessionReady);

  if (!appReady) {
    const label = sessionReady
      ? 'Preparing encryption…'
      : 'Loading session…';
    return (
      <div className="bg-background text-foreground flex min-h-svh items-center justify-center px-4 text-center">
        <p className="text-muted text-sm">{label}</p>
      </div>
    );
  }

  return children;
}
