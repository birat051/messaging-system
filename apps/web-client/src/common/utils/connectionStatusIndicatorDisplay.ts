import type { PresenceConnectionStatus } from '@/common/realtime/socketBridge';

/** Compact copy for the connection badge (see **`presenceLabel`** for full detail). */
export function connectionStatusIndicatorLabel(
  status: PresenceConnectionStatus,
): string {
  switch (status.kind) {
    case 'idle':
      return 'Not connected';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Connection error';
  }
}

export function connectionStatusIndicatorDotClass(
  status: PresenceConnectionStatus,
): string {
  switch (status.kind) {
    case 'idle':
      return 'bg-muted-foreground/60';
    case 'connecting':
      return 'bg-amber-500';
    case 'connected':
      return 'bg-emerald-500';
    case 'disconnected':
      return 'bg-slate-400 dark:bg-slate-500';
    case 'error':
      return 'bg-red-500';
  }
}
