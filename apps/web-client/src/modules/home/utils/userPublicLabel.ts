import type { components } from '@/generated/api-types';

type UserPublic = components['schemas']['UserPublic'];

/**
 * Thread title / list row when **`peerUserId`** is the signed-in user (note-to-self / saved-messages style).
 */
export const SELF_DIRECT_THREAD_LABEL = 'Note to self';

export function isDirectPeerSelf(
  peerId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  const p = peerId?.trim();
  const u = currentUserId?.trim();
  return Boolean(p && u && p === u);
}

/**
 * Label when we only have a peer id and **`GET /users/:id`** did not return a profile (or failed).
 */
export function formatMissingPeerProfileLabel(peerId: string): string {
  const s = peerId.trim();
  if (!s) {
    return 'Unknown contact';
  }
  return `Unknown contact · ${s.slice(0, 8)}`;
}

/**
 * Display line for a **`UserPublic`** profile — **`displayName`**, then **`guest`**-aware id fallback (no **`username`**
 * on this schema).
 */
export function formatUserPublicLabel(user: UserPublic): string {
  const name = user.displayName?.trim();
  if (name) {
    return name;
  }
  const id = user.id;
  if (user.guest) {
    return `Guest ${id.slice(0, 8)}`;
  }
  return `User ${id.slice(0, 8)}`;
}
