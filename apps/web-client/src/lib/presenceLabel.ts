import type { PresenceConnectionStatus } from '../realtime/socketBridge';

/**
 * Human-readable line for Socket.IO presence status in the UI.
 */
export function presenceLabel(status: PresenceConnectionStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Presence: idle (sign in to connect)';
    case 'connecting':
      return 'Presence: connecting…';
    case 'connected':
      return `Presence: connected${status.socketId ? ` (${status.socketId.slice(0, 8)}…)` : ''}`;
    case 'disconnected':
      return `Presence: disconnected (${status.reason})`;
    case 'error':
      return `Presence: error — ${status.message}`;
  }
}
