import type { SocketAuthResult } from './socketAuth.js';

declare module 'socket.io' {
  interface SocketData {
    /** Result of **`resolveSocketAuth`** at the **connection** handshake only — not re-run per event. */
    authAtConnect: SocketAuthResult;
  }
}
