/** OpenAPI `User` — safe for clients (no password fields). */
export type UserApiShape = {
  id: string;
  /** **`null`** for guest accounts (no email stored). */
  email: string | null;
  /** Normalized handle — **`null`** for legacy accounts created before usernames were required. */
  username: string | null;
  displayName: string | null;
  emailVerified: boolean;
  profilePicture: string | null;
  status: string | null;
  /** Temporary guest sandbox account when **`true`**. */
  guest: boolean;
};

/** OpenAPI `UserPublic` — no email (e.g. search / directory views). */
export type UserPublicApiShape = {
  id: string;
  username: string | null;
  displayName: string | null;
  profilePicture: string | null;
  status: string | null;
  guest: boolean;
};

/** OpenAPI `UserSearchResult` — directory search row (no email field). */
export type UserSearchResult = {
  userId: string;
  username: string | null;
  displayName: string | null;
  profilePicture: string | null;
  conversationId: string | null;
  guest: boolean;
};
