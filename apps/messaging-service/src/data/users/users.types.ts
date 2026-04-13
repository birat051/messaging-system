/** OpenAPI `User` — safe for clients (no password fields). */
export type UserApiShape = {
  id: string;
  email: string;
  /** Normalized handle — **`null`** for legacy accounts created before usernames were required. */
  username: string | null;
  displayName: string | null;
  emailVerified: boolean;
  profilePicture: string | null;
  status: string | null;
};

/** OpenAPI `UserPublic` — no email (e.g. search / directory views). */
export type UserPublicApiShape = {
  id: string;
  displayName: string | null;
  profilePicture: string | null;
  status: string | null;
};

/** OpenAPI `UserSearchResult` — directory search row (no email field). */
export type UserSearchResult = {
  userId: string;
  username: string | null;
  displayName: string | null;
  profilePicture: string | null;
  conversationId: string | null;
};
