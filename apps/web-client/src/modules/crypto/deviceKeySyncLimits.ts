/**
 * Page size for **`GET /users/me/sync/message-keys`** during trusted-device re-wrap (**`useDeviceKeySync`**).
 * Capped at **`MAX_DEVICE_KEY_SYNC_PAGE_LIMIT`** to match **`messaging-service`** **`MAX_LIST_LIMIT`** / OpenAPI **`LimitQuery.maximum`**.
 */
export const MAX_DEVICE_KEY_SYNC_PAGE_LIMIT = 100;

/** Default batch size (checklist: 100). */
export const DEFAULT_DEVICE_KEY_SYNC_PAGE_LIMIT = 100;

export function clampDeviceKeySyncPageLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DEVICE_KEY_SYNC_PAGE_LIMIT;
  }
  return Math.min(
    Math.max(1, Math.floor(value)),
    MAX_DEVICE_KEY_SYNC_PAGE_LIMIT,
  );
}

/**
 * Effective page size: optional **`override`** (e.g. tests), else **`VITE_DEVICE_KEY_SYNC_PAGE_LIMIT`**, else **100**.
 */
export function resolveDeviceKeySyncPageLimit(options?: {
  override?: number;
}): number {
  if (options?.override !== undefined) {
    return clampDeviceKeySyncPageLimit(options.override);
  }
  const raw = import.meta.env.VITE_DEVICE_KEY_SYNC_PAGE_LIMIT;
  if (raw === undefined || raw === '') {
    return DEFAULT_DEVICE_KEY_SYNC_PAGE_LIMIT;
  }
  return clampDeviceKeySyncPageLimit(Number(String(raw).trim()));
}
