import { useEffect, useRef } from 'react';
import { PRESENCE_HEARTBEAT_COMPACT_MS } from '../utils/presenceCadence';
import { useSocketWorker } from '../realtime/SocketWorkerProvider';
import {
  presenceClearedForUser,
  presenceUserError,
  presenceUserFromResult,
  presenceUserLoading,
} from '@/modules/app/stores/presenceSlice';
import { selectUserPresenceEntry } from '@/modules/app/stores/presenceSelectors';
import {
  PRESENCE_IDLE_ENTRY,
  type UserPresenceEntry,
} from '@/modules/app/stores/presenceTypes';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export type UseLastSeenState = UserPresenceEntry;

export type UseLastSeenOptions = {
  /**
   * When **`true`**, re-fetch **`presence:getLastSeen`** on a compact interval while the socket stays connected
   * (direct thread header “live” last-seen; aligns with **`PRESENCE_HEARTBEAT_COMPACT_MS`**).
   * There is no server→client **`presence:*`** push today — this is the polling fallback; the cache is also
   * cleared on **`message:new`** for the active conversation (**`SocketWorkerProvider`**) so the header refetches immediately.
   */
  liveRefresh?: boolean;
};

/** In-flight **`getLastSeen`** per user — avoids duplicate requests (list + header). */
const presenceFetchInflight = new Map<string, Promise<void>>();

function tryBeginPresenceFetch(userId: string): boolean {
  if (presenceFetchInflight.has(userId)) {
    return false;
  }
  presenceFetchInflight.set(userId, Promise.resolve());
  return true;
}

/**
 * Loads last-seen for **`targetUserId`** via **`presence:getLastSeen`** ack, cached in Redux **`presence.byUserId`**.
 * **`liveRefresh`** polls acks on an interval; **`presenceClearedForUser`** (e.g. inbound **`message:new`** in the open thread)
 * drops the cache so this hook’s load effect runs again — no full page reload.
 */
export function useLastSeen(
  targetUserId: string | null | undefined,
  options?: UseLastSeenOptions,
): UseLastSeenState {
  const liveRefresh = options?.liveRefresh === true;
  const dispatch = useAppDispatch();
  const socket = useSocketWorker();
  const getLastSeen = socket?.getLastSeen;
  const connected = socket?.status.kind === 'connected';

  const socketLiveRef = useRef(false);
  socketLiveRef.current = Boolean(connected && getLastSeen);

  const liveRefreshRef = useRef(liveRefresh);
  liveRefreshRef.current = liveRefresh;

  const id = targetUserId?.trim() ?? '';
  const entry = useAppSelector((s) =>
    id ? selectUserPresenceEntry(s, id) : PRESENCE_IDLE_ENTRY,
  );
  const entryStatus = entry.status;

  useEffect(() => {
    if (!id) {
      return;
    }
    if (!connected || !getLastSeen) {
      dispatch(presenceClearedForUser({ userId: id }));
      return;
    }

    if (
      entryStatus === 'ok' ||
      entryStatus === 'not_available' ||
      entryStatus === 'error'
    ) {
      return;
    }

    if (!tryBeginPresenceFetch(id)) {
      return;
    }

    dispatch(presenceUserLoading({ userId: id }));

    void (async () => {
      try {
        const result = await getLastSeen(id);
        if (!socketLiveRef.current) {
          return;
        }
        if (result.status === 'ok' || result.status === 'not_available') {
          dispatch(presenceUserFromResult({ userId: id, result }));
        }
      } catch (err: unknown) {
        if (!socketLiveRef.current) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Last seen unavailable';
        dispatch(presenceUserError({ userId: id, message }));
      } finally {
        presenceFetchInflight.delete(id);
      }
    })();
  }, [id, connected, getLastSeen, dispatch, entryStatus]);

  useEffect(() => {
    if (!liveRefresh || !id || !connected || !getLastSeen) {
      return;
    }

    const tick = (): void => {
      void (async () => {
        try {
          const result = await getLastSeen(id);
          if (!socketLiveRef.current || !liveRefreshRef.current) {
            return;
          }
          if (result.status === 'ok' || result.status === 'not_available') {
            dispatch(presenceUserFromResult({ userId: id, result }));
          }
        } catch (err: unknown) {
          if (!socketLiveRef.current || !liveRefreshRef.current) {
            return;
          }
          const message =
            err instanceof Error ? err.message : 'Last seen unavailable';
          dispatch(presenceUserError({ userId: id, message }));
        }
      })();
    };

    tick();
    const t = window.setInterval(tick, PRESENCE_HEARTBEAT_COMPACT_MS);
    return () => {
      window.clearInterval(t);
    };
  }, [liveRefresh, id, connected, getLastSeen, dispatch]);

  return entry;
}
