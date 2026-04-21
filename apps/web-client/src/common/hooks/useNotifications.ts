import { useEffect, useMemo, useRef } from 'react';
import { playInboundNotificationSound } from '@/common/notifications/notificationAlertSounds';
import { formatInboundNotificationToast } from '@/common/notifications/notificationToastCopy';
import { tryMarkInboundToastShown } from '@/common/notifications/inboundToastDedupe';
import {
  selectNotificationsInbound,
  type InboundNotificationRow,
} from '@/modules/app/stores/notificationsSlice';
import { useAppSelector } from '@/store/hooks';
import { useToast } from '@/common/components/toast/useToast';

/**
 * Surfaces inbound Socket.IO **`notification`** events (stored in Redux by **`SocketWorkerProvider`**).
 * **`kind: 'message'`** — **sound only** (no toast): previews may be E2EE ciphertext from the server.
 * **`kind: 'call_incoming'`** — **sound only** (no toast); the call UI (**`CallSessionDock`**) is the surface.
 * Any other kinds — **info** toast plus **`playInboundNotificationSound`**.
 */
export function useNotifications(): {
  pendingInbound: InboundNotificationRow[];
} {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const inbound = useAppSelector(selectNotificationsInbound);
  /** Stable while IDs unchanged — avoids duplicate toast/sound when `inbound` array identity churns. */
  const inboundIdsKey = useMemo(
    () => inbound.map((r) => r.notificationId).join('|'),
    [inbound],
  );

  useEffect(() => {
    if (inbound.length === 0) {
      return;
    }
    const t = toastRef.current;
    for (const row of inbound) {
      if (!tryMarkInboundToastShown(row.notificationId)) {
        continue;
      }
      playInboundNotificationSound(row.payload.kind);
      if (
        row.payload.kind !== 'message' &&
        row.payload.kind !== 'call_incoming'
      ) {
        t.info(formatInboundNotificationToast(row.payload));
      }
    }
    // Intentionally depend on id list only — `inbound` identity can churn without new notifications.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboundIdsKey]);

  return { pendingInbound: inbound };
}
