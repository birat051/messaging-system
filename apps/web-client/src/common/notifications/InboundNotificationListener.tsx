import { useNotifications } from '@/common/hooks/useNotifications';

/**
 * Mount under **`ToastProvider`** (same tree as **`SocketWorkerProvider`**) so **`useToast`** is available.
 * No UI — **`useNotifications`** drives toasts from Redux **`notifications.inbound`**.
 */
export function InboundNotificationListener(): null {
  useNotifications();
  return null;
}
