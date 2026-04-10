import type { Env } from '../config/env.js';
import { findDirectConversationIdBetween } from '../conversations/repo.js';
import { findUserById } from '../users/repo.js';

export type PublicKeyFetchAuthz =
  | 'ok'
  | 'target_not_found'
  | 'forbidden';

/**
 * **GET `/users/{userId}/public-key`** — who may read another user's directory row.
 *
 * - **Self** (`caller === target`): always allowed (caller still needs a registered key for **200**).
 * - **Strict mode** (`PUBLIC_KEY_FETCH_REQUIRE_DIRECT_THREAD`): allowed only if an existing **direct**
 *   conversation links caller and target (or self).
 * - **Default (loose):** any authenticated user may fetch a **registered** user's key — matches the
 *   ability to start a **new direct** thread to that user (**`sendMessage`** only requires the
 *   recipient to exist). Tighten with **`PUBLIC_KEY_FETCH_REQUIRE_DIRECT_THREAD=true`** when product
 *   adds blocklists / first-contact rules.
 */
export async function resolvePublicKeyFetchAuthz(
  callerUserId: string,
  targetUserId: string,
  env: Env,
): Promise<PublicKeyFetchAuthz> {
  const caller = callerUserId.trim();
  const target = targetUserId.trim();
  if (caller.length === 0 || target.length === 0) {
    return 'target_not_found';
  }
  if (caller === target) {
    return 'ok';
  }

  const targetUser = await findUserById(target);
  if (!targetUser) {
    return 'target_not_found';
  }

  if (!env.PUBLIC_KEY_FETCH_REQUIRE_DIRECT_THREAD) {
    return 'ok';
  }

  const directId = await findDirectConversationIdBetween(caller, target);
  if (directId) {
    return 'ok';
  }

  return 'forbidden';
}
