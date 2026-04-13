import type { components } from '@/generated/api-types';
import {
  isRecipientPublicKeyNonRetryableClientError,
  isTransientHttpRetryableError,
  parseApiError,
} from '@/modules/auth/utils/apiError';
import { getUserPublicKeyById } from '../api/usersApi';

type UserPublicKeyResponse = components['schemas']['UserPublicKeyResponse'];

/** Total attempts for **`GET /users/{id}/public-key`** (first try + retries). */
const MAX_ATTEMPTS = 5;

function backoffMs(attemptIndex: number): number {
  return Math.min(400 * 2 ** attemptIndex, 4_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Shown only after **`MAX_ATTEMPTS`** consecutive **404** responses (recipient truly has no directory key).
 */
export const RECIPIENT_NO_KEY_AVAILABLE_MESSAGE =
  'No encryption key is registered for this contact yet. After they sign in once using HTTPS or localhost, try again.';

/**
 * Fetches the recipient’s directory public key for E2EE, with **backoff retries** so a first message
 * does not fail on transient errors or a brief **404** race (e.g. peer key not visible yet).
 * Surfaces **`RECIPIENT_NO_KEY_AVAILABLE_MESSAGE`** only when the key is still missing after all attempts.
 */
export async function fetchRecipientPublicKeyForMessaging(
  recipientUserId: string,
): Promise<UserPublicKeyResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await getUserPublicKeyById(recipientUserId);
    } catch (e) {
      lastErr = e;
      if (isRecipientPublicKeyNonRetryableClientError(e)) {
        throw e;
      }

      const p = parseApiError(e);
      const canRetry =
        attempt < MAX_ATTEMPTS - 1 &&
        (p.httpStatus === 404 || isTransientHttpRetryableError(e));

      if (canRetry) {
        await delay(backoffMs(attempt));
        continue;
      }

      if (p.httpStatus === 404) {
        throw new Error(RECIPIENT_NO_KEY_AVAILABLE_MESSAGE);
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not load recipient key.');
}

/**
 * Best-effort **`GET /users/{id}/public-key`** when a peer is selected (conversation or search).
 * Swallows errors — **`fetchRecipientPublicKeyForMessaging`** still runs at send time with retries.
 * Helps warm TLS/DNS and any HTTP cache before the user hits Send.
 */
export function prefetchRecipientPublicKey(
  recipientUserId: string | null | undefined,
): void {
  const id = recipientUserId?.trim();
  if (!id) {
    return;
  }
  void getUserPublicKeyById(id).catch(() => {
    /* prefetch only */
  });
}
