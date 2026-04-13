/**
 * REST + Socket.IO base configuration (**`VITE_API_BASE_URL`** only).
 *
 * **Same origin:** **`getSocketUrl()`** derives the Socket.IO **origin** from this value (absolute URL →
 * **`new URL(...).origin`**; relative **`/v1`** → **`window.location.origin`** in the browser). The worker
 * connects with **`path: '/socket.io'`** on that origin. Avoid pointing REST at host **A** and browsing the
 * SPA on host **B** unless **`VITE_API_BASE_URL`** is an absolute URL whose **origin** is the API + Socket.IO
 * host (prevents mixed content / wrong-port sockets).
 *
 * **Dev:** Vite proxies **`/v1`** and **`/socket.io`** to the same backend (**`vite.config.ts`**).
 * **Compose:** **`infra/nginx/nginx.conf`** proxies **`/`** to **messaging-service** with WebSocket **Upgrade** headers.
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw?.startsWith('http')) {
    return raw.replace(/\/$/, '');
  }
  const path = raw?.startsWith('/') ? raw : `/${raw ?? 'v1'}`;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`.replace(/\/$/, '');
  }
  return `http://localhost:8080${path}`.replace(/\/$/, '');
}

/**
 * Origin for **Socket.IO** (path **`/socket.io`** on the same host as the API).
 */
export function getSocketUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw?.startsWith('http')) {
    try {
      return new URL(raw).origin;
    } catch {
      return 'http://localhost:8080';
    }
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:8080';
}
