import type { components } from '@/generated/api-types';

type UserSearchResult = components['schemas']['UserSearchResult'];

/**
 * Resolves a search hit: shell navigation (**`onOpenConversation`** / **`onStartDirectFromSearch`**)
 * or inline selection for the standalone **`UserSearchPanel`** card.
 */
export function handleUserSearchSelection(
  user: UserSearchResult,
  options: {
    onOpenConversation?: (conversationId: string) => void;
    onStartDirectFromSearch?: (hit: UserSearchResult) => void;
    onInlineSelect?: (hit: UserSearchResult) => void;
    resetAfterNavigate?: () => void;
  },
): void {
  const cid = user.conversationId?.trim();
  if (cid && options.onOpenConversation) {
    options.onOpenConversation(cid);
    options.resetAfterNavigate?.();
    return;
  }
  if (!cid && options.onStartDirectFromSearch) {
    options.onStartDirectFromSearch(user);
    options.resetAfterNavigate?.();
    return;
  }
  options.onInlineSelect?.(user);
}
