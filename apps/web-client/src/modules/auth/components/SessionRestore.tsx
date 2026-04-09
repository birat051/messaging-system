import { type ReactNode, useEffect, useState } from 'react';
import { useAppDispatch } from '../../../store/hooks';
import { bootstrapSessionIfNeeded } from '../utils/sessionBootstrap';

type Props = { children: ReactNode };

/**
 * Runs **`bootstrapSessionIfNeeded`** once on mount before rendering **`children`**, so
 * **`ProtectedRoute`** sees a restored access token when a refresh cookie/token exists.
 */
export function SessionRestore({ children }: Props) {
  const dispatch = useAppDispatch();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void bootstrapSessionIfNeeded(dispatch).finally(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  if (!ready) {
    return (
      <div className="bg-background text-foreground flex min-h-svh items-center justify-center">
        <p className="text-muted text-sm">Loading session…</p>
      </div>
    );
  }

  return children;
}
