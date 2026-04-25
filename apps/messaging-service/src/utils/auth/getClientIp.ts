import type { Request } from 'express';
import type { Socket } from 'socket.io';

/**
 * Best-effort client IP for rate limiting — first **`X-Forwarded-For`** hop when set
 * (**`infra/dev/nginx/nginx.conf`**; rate limits in **`apps/messaging-service/.env.example`**).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  const raw = req.socket?.remoteAddress;
  return raw && raw.length > 0 ? raw : 'unknown';
}

/**
 * Client IP from a Socket.IO handshake — **`x-forwarded-for`** first (when behind a proxy), else
 * **`handshake.address`** / transport remote address.
 */
export function getSocketClientIp(socket: Socket): string {
  const xff = socket.handshake.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  const fromHandshake = socket.handshake.address;
  if (typeof fromHandshake === 'string' && fromHandshake.length > 0) {
    return fromHandshake;
  }
  const raw = socket.conn?.remoteAddress;
  return raw && raw.length > 0 ? raw : 'unknown';
}
