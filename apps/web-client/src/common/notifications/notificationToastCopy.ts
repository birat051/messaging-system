import type { ParsedNotificationPayload } from '@/common/realtime/socketNotificationPayload';

const PREVIEW_MAX = 100;

/**
 * User-visible string for **`ToastProvider`** when **`useNotifications`** shows a toast.
 * **`call_incoming`** is handled with **sound only** in **`useNotifications`** (no toast).
 */
export function formatInboundNotificationToast(
  payload: ParsedNotificationPayload,
): string {
  if (payload.kind === 'message') {
    const from = payload.senderDisplayName?.trim() || 'Someone';
    const preview = payload.preview?.trim();
    if (preview) {
      const clipped =
        preview.length > PREVIEW_MAX
          ? `${preview.slice(0, PREVIEW_MAX - 1)}…`
          : preview;
      return `New message from ${from}: ${clipped}`;
    }
    return `New message from ${from}`;
  }
  const mediaLabel = payload.media === 'video' ? 'video' : 'audio';
  const name = payload.callerDisplayName?.trim() || 'Someone';
  return `Incoming ${mediaLabel} call from ${name}`;
}
