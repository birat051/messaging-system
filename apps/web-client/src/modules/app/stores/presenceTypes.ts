/**
 * Per-user result of **`presence:getLastSeen`** (Feature 6), stored in **`presence.byUserId`**.
 * A missing map entry is treated like **`idle`** in selectors.
 */
export type UserPresenceEntry =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; source: 'redis' | 'mongodb'; lastSeenAt: string }
  | { status: 'not_available' }
  | { status: 'error'; message: string };

/** Stable default for “never loaded” — shared reference for **`useSelector`** equality. */
export const PRESENCE_IDLE_ENTRY: UserPresenceEntry = { status: 'idle' };
