import type { RootState } from '@/store/store';
import {
  PRESENCE_IDLE_ENTRY,
  type UserPresenceEntry,
} from './presenceTypes';

/**
 * **`idle`** when the map has no entry (same as never requested).
 */
export function selectUserPresenceEntry(
  state: RootState,
  userId: string | null | undefined,
): UserPresenceEntry {
  const id = userId?.trim() ?? '';
  if (!id) {
    return PRESENCE_IDLE_ENTRY;
  }
  return state.presence.byUserId[id] ?? PRESENCE_IDLE_ENTRY;
}

/**
 * **Online heuristic (Feature 6):** the peer has a **hot Redis** last-seen (socket up with
 * recent **`presence:heartbeat`** on the server). Does *not* infer online from MongoDB alone.
 */
export function selectIsPeerOnline(
  state: RootState,
  userId: string | null | undefined,
): boolean {
  const id = userId?.trim() ?? '';
  if (!id) {
    return false;
  }
  const e = state.presence.byUserId[id];
  return e?.status === 'ok' && e.source === 'redis';
}

/**
 * **`true`** when we have any resolved row for UI (**not** idle/loading) — e.g. list subtitle slot.
 */
export function selectHasPeerPresenceHint(
  state: RootState,
  userId: string | null | undefined,
): boolean {
  const e = selectUserPresenceEntry(state, userId);
  return e.status !== 'idle' && e.status !== 'loading';
}
