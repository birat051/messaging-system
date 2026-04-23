import 'axios';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Skip **401** refresh loop (used for **`POST /auth/refresh`**). */
    skipAuthRefresh?: boolean;
    /** Bypass device-sync gate on **`/conversations`** / **`/messages`** (tests / rare tooling). */
    skipDeviceSyncMessagingGate?: boolean;
    /** After one successful refresh, retry original request only once. */
    _retryAfterRefresh?: boolean;
  }
}
