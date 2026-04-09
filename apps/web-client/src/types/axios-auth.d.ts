import 'axios';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Skip **401** refresh loop (used for **`POST /auth/refresh`**). */
    skipAuthRefresh?: boolean;
    /** After one successful refresh, retry original request only once. */
    _retryAfterRefresh?: boolean;
  }
}
