import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ParsedNotificationPayload } from '@/common/realtime/socketNotificationPayload';

const MAX_INBOUND = 100;

export type InboundNotificationRow = {
  notificationId: string;
  receivedAt: string;
  payload: ParsedNotificationPayload;
};

export type NotificationsState = {
  /** Deduped append-only queue for toasts / future notification centre. */
  inbound: InboundNotificationRow[];
  /** Prevents duplicate **`notificationId`** rows after queue eviction. */
  seenNotificationIds: Record<string, true>;
};

export const notificationsInitialState: NotificationsState = {
  inbound: [],
  seenNotificationIds: {},
};

export const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: notificationsInitialState,
  reducers: {
    appendInboundNotification: (
      state,
      action: PayloadAction<ParsedNotificationPayload>,
    ) => {
      const id = action.payload.notificationId;
      if (state.seenNotificationIds[id]) {
        return;
      }
      state.seenNotificationIds[id] = true;
      state.inbound.push({
        notificationId: id,
        receivedAt: new Date().toISOString(),
        payload: action.payload,
      });
      while (state.inbound.length > MAX_INBOUND) {
        const removed = state.inbound.shift();
        if (removed) {
          delete state.seenNotificationIds[removed.notificationId];
        }
      }
    },
    resetNotifications: () => notificationsInitialState,
  },
});

export const { appendInboundNotification, resetNotifications } =
  notificationsSlice.actions;

export const notificationsReducer = notificationsSlice.reducer;

export function selectNotificationsInbound(state: {
  notifications: NotificationsState;
}): InboundNotificationRow[] {
  return state.notifications.inbound;
}
