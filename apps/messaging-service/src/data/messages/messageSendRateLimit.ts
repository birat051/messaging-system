import { rateLimitExceeded } from '../../utils/auth/rateLimitRedis.js';
import type { Env } from '../../config/env.js';

/**
 * Redis fixed-window limits shared by **`POST /v1/messages`** and Socket.IO **`message:send`**.
 * Checks **per user** (stricter bucket for **guest** senders), **per client IP**, and (socket path only) **per connection id**.
 *
 * Returns **`true`** when **any** dimension exceeds its cap (same policy as **`GET /users/search`**).
 */
export async function isMessageSendRateLimited(
  env: Env,
  opts: {
    userId: string;
    ip: string;
    /** When set (Socket.IO), also enforces a per-connection cap. */
    socketId?: string;
    /** When true, **`GUEST_MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER`** applies instead of **`MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER`**. */
    isGuest?: boolean;
  },
): Promise<boolean> {
  const w = env.MESSAGE_SEND_RATE_LIMIT_WINDOW_SEC;
  const maxUser = opts.isGuest
    ? env.GUEST_MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER
    : env.MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER;
  const userKey = opts.isGuest
    ? `ratelimit:message-send:guest-user:${opts.userId}`
    : `ratelimit:message-send:user:${opts.userId}`;
  const maxIp = env.MESSAGE_SEND_RATE_LIMIT_MAX_PER_IP;
  const maxSocket = env.MESSAGE_SEND_RATE_LIMIT_MAX_PER_SOCKET;

  if (await rateLimitExceeded(userKey, w, maxUser)) {
    return true;
  }

  if (
    await rateLimitExceeded(`ratelimit:message-send:ip:${opts.ip}`, w, maxIp)
  ) {
    return true;
  }

  if (opts.socketId !== undefined) {
    if (
      await rateLimitExceeded(
        `ratelimit:message-send:socket:${opts.socketId}`,
        w,
        maxSocket,
      )
    ) {
      return true;
    }
  }

  return false;
}
