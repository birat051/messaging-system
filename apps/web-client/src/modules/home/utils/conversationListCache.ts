import type { components } from '@/generated/api-types';

type Conversation = components['schemas']['Conversation'];
type ConversationPage = components['schemas']['ConversationPage'];

export type ConversationsListMutate = ReturnType<
  (typeof import('swr'))['useSWRConfig']
>['mutate'];

/** Matches **`GET /conversations`** — **newest `updatedAt` first** (OpenAPI). */
export function sortConversationsNewestFirst(items: Conversation[]): Conversation[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Bumps **`conversationId`** to reflect new activity (**`updatedAt`** = last message time) and returns sorted list data.
 * Returns **`found: false`** when that conversation is not yet in the page (e.g. list not loaded or new thread).
 */
export function applyConversationBumpedActivity(
  page: ConversationPage,
  conversationId: string,
  updatedAtIso: string,
): { next: ConversationPage; found: boolean } {
  const idx = page.items.findIndex((c) => c.id === conversationId);
  if (idx === -1) {
    return { next: page, found: false };
  }
  const row = page.items[idx];
  const bumped: Conversation = { ...row, updatedAt: updatedAtIso };
  const rest = page.items.filter((_, i) => i !== idx);
  return {
    next: {
      ...page,
      items: sortConversationsNewestFirst([bumped, ...rest]),
    },
    found: true,
  };
}

const CONVERSATIONS_KEY = 'conversations' as const;

/**
 * Updates the **`['conversations', userId]`** SWR cache so the thread moves to the **top** by **`updatedAt`**
 * (same ordering as the API). If the conversation is missing from cached data, triggers a **background revalidation**
 * so new or not-yet-loaded threads still appear in order.
 */
export function bumpConversationInListCache(
  mutate: ConversationsListMutate,
  userId: string,
  conversationId: string,
  updatedAtIso: string,
): void {
  const key = [CONVERSATIONS_KEY, userId] as const;
  void mutate(
    key,
    (prev: ConversationPage | undefined): ConversationPage | undefined => {
      if (prev === undefined) {
        queueMicrotask(() => {
          try {
            void Promise.resolve(mutate(key)).catch(() => {});
          } catch {
            /* SWR internal cache may be gone after unmount (e.g. tests). */
          }
        });
        return prev;
      }
      const { next, found } = applyConversationBumpedActivity(
        prev,
        conversationId,
        updatedAtIso,
      );
      if (!found) {
        queueMicrotask(() => {
          try {
            void Promise.resolve(mutate(key)).catch(() => {});
          } catch {
            /* SWR internal cache may be gone after unmount (e.g. tests). */
          }
        });
        return prev;
      }
      return next;
    },
    { revalidate: false },
  );
}
