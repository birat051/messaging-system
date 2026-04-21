import { useEffect } from 'react';
import { clearCallSessionEndReason } from '@/modules/home/stores/callSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

const REMOTE_END_TOAST_MS = 3000;

/**
 * Prominent, non-blocking notice when the peer ends the 1:1 call (**`webrtc:hangup`**).
 * Auto-dismisses after **`REMOTE_END_TOAST_MS`**; clears **`lastSessionEndReason`** in Redux.
 */
export function RemoteCallEndedToast() {
  const dispatch = useAppDispatch();
  const lastSessionEndReason = useAppSelector((s) => s.call.lastSessionEndReason);
  const lastRemoteEndedPeerLabel = useAppSelector(
    (s) => s.call.lastRemoteEndedPeerLabel,
  );

  useEffect(() => {
    if (lastSessionEndReason !== 'remote') {
      return;
    }
    const id = window.setTimeout(() => {
      dispatch(clearCallSessionEndReason());
    }, REMOTE_END_TOAST_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [lastSessionEndReason, dispatch]);

  if (lastSessionEndReason !== 'remote') {
    return null;
  }

  const who = lastRemoteEndedPeerLabel?.trim() || 'The other participant';

  return (
    <div
      className="border-border bg-surface/98 supports-[backdrop-filter]:bg-surface/95 fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-[60] w-[min(100%-2rem,24rem)] -translate-x-1/2 rounded-xl border px-4 py-3 text-center text-sm font-medium text-foreground shadow-lg backdrop-blur-md sm:text-base"
      role="status"
      aria-live="polite"
      data-testid="remote-call-ended-toast"
    >
      {who} ended the call.
    </div>
  );
}
