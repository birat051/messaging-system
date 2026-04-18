/** Survives component remount (e.g. React **`StrictMode`**) so the same **`notificationId`** does not toast twice. */
const toastedNotificationIds = new Set<string>();

export function tryMarkInboundToastShown(notificationId: string): boolean {
  if (toastedNotificationIds.has(notificationId)) {
    return false;
  }
  toastedNotificationIds.add(notificationId);
  return true;
}

/** Call when **`notifications`** queue is cleared (sign-out). */
export function clearInboundToastDedupe(): void {
  toastedNotificationIds.clear();
}
