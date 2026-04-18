import { useEffect, useRef } from 'react';
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
 * Loads last-seen for **`targetUserId`** via **`presence:getLastSeen`**, cached in Redux **`presence.byUserId`**.
 */
export function useLastSeen(
  targetUserId: string | null | undefined,
): UseLastSeenState {
  const dispatch = useAppDispatch();
  const socket = useSocketWorker();
  const getLastSeen = socket?.getLastSeen;
  const connected = socket?.status.kind === 'connected';

  const socketLiveRef = useRef(false);
  socketLiveRef.current = Boolean(connected && getLastSeen);

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

  return entry;
}
