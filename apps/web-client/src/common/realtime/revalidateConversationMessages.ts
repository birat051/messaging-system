import type { ScopedMutator } from 'swr';

/**
 * After hybrid keys exist for this **`userId`**, revalidate all **`['conversation-messages', …, userId]`** SWR caches
 * so **`usePeerMessageDecryption`** can decrypt history with **`unwrapMessageKey`** + **`decryptMessageBody`**.
 */
export function revalidateConversationMessagesForUser(
  mutate: ScopedMutator,
  userId: string,
): void {
  const uid = userId.trim();
  if (!uid) {
    return;
  }
  void mutate(
    (key) =>
      Array.isArray(key) &&
      key[0] === 'conversation-messages' &&
      key[2] === uid,
  );
}
