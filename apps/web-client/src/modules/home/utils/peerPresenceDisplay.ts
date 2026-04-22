import type { UserPresenceEntry } from '@/modules/app/stores/presenceTypes';

export type PeerPresenceVariant = 'online' | 'stale' | 'unknown' | 'hidden';

export type PeerPresenceDisplay = {
  /** Short line for header / list; **`null`** when nothing should show */
  text: string | null;
  variant: PeerPresenceVariant;
};

/** Product rule: **Redis** (`source`) ⇒ peer socket is up with recent heartbeats ⇒ **Online**. **MongoDB** ⇒ durable last-seen when offline ⇒ **relative “last seen”** (stale). */
export function formatRelativeLastSeenAge(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return '—';
  }
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 60) {
    return 'just now';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) {
    return `${diffH}h ago`;
  }
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) {
    return `${diffD}d ago`;
  }
  return new Date(t).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Maps **`useLastSeen`** state to a compact line + style variant (**Feature 6**), e.g. **thread header** only.
 */
export function peerPresenceDisplay(
  state: UserPresenceEntry,
  nowMs: number,
): PeerPresenceDisplay {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return { text: null, variant: 'hidden' };
    case 'ok':
      if (state.source === 'redis') {
        return { text: 'Online', variant: 'online' };
      }
      return {
        text: `Last seen ${formatRelativeLastSeenAge(state.lastSeenAt, nowMs)}`,
        variant: 'stale',
      };
    case 'not_available':
      return { text: 'Last seen unavailable', variant: 'unknown' };
    case 'error':
      return { text: 'Could not load activity', variant: 'unknown' };
  }
}

/** Tailwind classes for presence line by variant (subtle; **online** uses semantic green). */
export function peerPresenceTextClassName(variant: PeerPresenceVariant): string {
  switch (variant) {
    case 'online':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'stale':
    case 'unknown':
      return 'text-muted-foreground';
    case 'hidden':
      return '';
  }
}
