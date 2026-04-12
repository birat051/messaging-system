import { rateLimitExceeded } from '../../utils/auth/rateLimitRedis.js';
import type { Env } from '../../config/env.js';

/**
 * Redis fixed-window limits for Socket.IO receipt events (**`message:delivered`**, **`message:read`**,
 * **`conversation:read`**) — per **user**, **per client IP**, and per **socket id**.
 */
export async function isMessageReceiptRateLimited(
  env: Env,
  opts: {
    userId: string;
    ip: string;
    socketId?: string;
  },
): Promise<boolean> {
  const w = env.MESSAGE_RECEIPT_RATE_LIMIT_WINDOW_SEC;
  const maxUser = env.MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_USER;
  const maxIp = env.MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_IP;
  const maxSocket = env.MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_SOCKET;

  if (
    await rateLimitExceeded(
      `ratelimit:message-receipt:user:${opts.userId}`,
      w,
      maxUser,
    )
  ) {
    return true;
  }

  if (
    await rateLimitExceeded(`ratelimit:message-receipt:ip:${opts.ip}`, w, maxIp)
  ) {
    return true;
  }

  if (opts.socketId !== undefined) {
    if (
      await rateLimitExceeded(
        `ratelimit:message-receipt:socket:${opts.socketId}`,
        w,
        maxSocket,
      )
    ) {
      return true;
    }
  }

  return false;
}
