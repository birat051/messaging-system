/**
 * REST API base URL (includes **`/v1`**).
 * Use an absolute URL (e.g. **`http://localhost:8080/v1`**) or a path (**`/v1`**) with the Vite dev proxy.
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
