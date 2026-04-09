import type { Request } from 'express';

/** Best-effort client IP for rate limiting (honest when **`trust proxy`** is set). */
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
