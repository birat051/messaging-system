import { findDirectConversationIdBetween } from '../conversations/repo.js';
import { findUserByEmail } from './repo.js';
import type { UserSearchResult } from './types.js';

/**
 * **`GET /users/search`** — matches **`email`** to a registered user (**normalized exact match** only).
 *
 * **Policy:** No prefix/typeahead (reduces email enumeration). Per-IP Redis rate limit on the route.
 * Broader discoverability is **Feature 5** follow-up.
 */
export async function searchUsersByEmailForCaller(params: {
  callerUserId: string;
  email: string;
  /** Effective page size (**`LimitQuery`**); exact match returns at most one row today. */
  limit: number;
}): Promise<UserSearchResult[]> {
  const exact = await findUserByEmail(params.email);
  if (!exact || exact.id === params.callerUserId) {
    return [];
  }
  const conversationId = await findDirectConversationIdBetween(
    params.callerUserId,
    exact.id,
  );
  const rows: UserSearchResult[] = [
    {
      userId: exact.id,
      displayName: exact.displayName,
      profilePicture: exact.profilePicture ?? null,
      conversationId,
    },
  ];
  return rows.slice(0, params.limit);
}
