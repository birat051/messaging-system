import { useEffect, useMemo, useState } from 'react';
import { useLastSeen } from '@/common/hooks/useLastSeen';
import {
  peerPresenceDisplay,
  type PeerPresenceDisplay,
} from '@/modules/home/utils/peerPresenceDisplay';

const STALE_TICK_MS = 60_000;

/**
 * Last-seen / **online** line for a direct thread peer (**Feature 6**).
 * Recomputes relative time on an interval when the peer is **offline** (Mongo last-seen).
 */
export function usePeerPresenceDisplay(
  targetUserId: string | null | undefined,
): PeerPresenceDisplay {
  const lastSeen = useLastSeen(targetUserId);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
  }, [lastSeen]);

  useEffect(() => {
    if (lastSeen.status !== 'ok' || lastSeen.source !== 'mongodb') {
      return;
    }
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, STALE_TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [lastSeen]);

  return useMemo(
    () => peerPresenceDisplay(lastSeen, nowMs),
    [lastSeen, nowMs],
  );
}
