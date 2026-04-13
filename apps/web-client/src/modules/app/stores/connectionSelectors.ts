import type { RootState } from '@/store/store';
import {
  mapPresenceToSocketLifecycle,
  type SocketIoLifecycle,
} from '@/common/realtime/socketBridge';

export function selectConnectionPresenceStatus(state: RootState) {
  return state.connection.presenceStatus;
}

/**
 * Same semantics as **`useSocketIoLifecycle(userId)`**: **`null`** when there is no signed-in user.
 */
export function selectSocketIoLifecycle(state: RootState): SocketIoLifecycle | null {
  if (!state.auth.user?.id?.trim()) {
    return null;
  }
  return mapPresenceToSocketLifecycle(state.connection.presenceStatus);
}
