import type { Env } from '../../config/env.js';
import { rateLimitExceeded } from '../../utils/auth/rateLimitRedis.js';

/**
 * Redis fixed-window limits for Socket.IO **WebRTC signaling** (**`webrtc:offer`**, **`webrtc:answer`**,
 * **`webrtc:candidate`**, **`webrtc:hangup`**) — per **user**, **IP**, and **socket**.
 */
export async function isWebRtcSignalRateLimited(
  env: Env,
  opts: {
    userId: string;
    ip: string;
    socketId?: string;
  },
): Promise<boolean> {
  const w = env.WEBRTC_SIGNAL_RATE_LIMIT_WINDOW_SEC;
  const maxUser = env.WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_USER;
  const maxIp = env.WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_IP;
  const maxSocket = env.WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_SOCKET;

  if (
    await rateLimitExceeded(
      `ratelimit:webrtc-signal:user:${opts.userId}`,
      w,
      maxUser,
    )
  ) {
    return true;
  }

  if (
    await rateLimitExceeded(`ratelimit:webrtc-signal:ip:${opts.ip}`, w, maxIp)
  ) {
    return true;
  }

  if (opts.socketId !== undefined) {
    if (
      await rateLimitExceeded(
        `ratelimit:webrtc-signal:socket:${opts.socketId}`,
        w,
        maxSocket,
      )
    ) {
      return true;
    }
  }

  return false;
}
