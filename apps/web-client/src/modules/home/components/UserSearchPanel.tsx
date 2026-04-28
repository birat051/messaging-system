import { useEffect, useId, useState } from 'react';
import type { components } from '@/generated/api-types';
import { usePrefetchDevicePublicKeys } from '@/common/hooks/usePrefetchDevicePublicKeys';
import { useAuth } from '@/common/hooks/useAuth';
import { useUserSearchQuery } from '@/modules/home/hooks/useUserSearchQuery';
import { handleUserSearchSelection } from '@/modules/home/utils/userSearchSelection';
import { FollowUpThreadComposer } from './FollowUpThreadComposer';
import { NewDirectThreadComposer } from './NewDirectThreadComposer';
import { UserSearchBar } from './UserSearchBar';
import { UserSearchResultsPane } from './UserSearchResultsPane';

type UserSearchResult = components['schemas']['UserSearchResult'];

function threadLabelFor(user: UserSearchResult): string {
  const name = user.displayName?.trim();
  if (name) return name;
  const handle = user.username?.trim();
  if (handle) return `@${handle}`;
  return `User ${user.userId.slice(0, 8)}`;
}

/**
 * Debounced search → **`GET /v1/users/search`**. For **guest** sessions the API returns **guest-scoped**
 * results only (registered users never appear). Loading / empty / error copy reflects that sandbox.
 *
 * Standalone: bordered card with inline **NewDirectThreadComposer** when no shell navigation callbacks exist.
 * **`HomeConversationShell`** composes **`UserSearchBar`** + **`UserSearchResultsPane`** instead.
 */
export function UserSearchPanel() {
  const { user } = useAuth();
  const isGuest = user?.guest === true;
  const id = useId();
  const headingId = `user-search-heading-${id}`;
  const inputId = `user-search-query-${id}`;

  const {
    query,
    setQuery,
    normalizedQuery,
    canSearch,
    data,
    showLoading,
    parsedError,
  } = useUserSearchQuery();

  const [selectedRecipient, setSelectedRecipient] = useState<UserSearchResult | null>(null);
  /** Persisted from **`message:send`** ack **`Message.conversationId`** after the first send in a new thread. */
  const [storedConversationId, setStoredConversationId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRecipient(null);
  }, [normalizedQuery]);

  useEffect(() => {
    setStoredConversationId(null);
  }, [selectedRecipient?.userId]);

  usePrefetchDevicePublicKeys(selectedRecipient?.userId);

  function handleSelectUser(hit: UserSearchResult): void {
    handleUserSearchSelection(hit, {
      onInlineSelect: setSelectedRecipient,
    });
  }

  return (
    <section
      data-testid="user-search-panel"
      className="border-border bg-background/50 space-y-3 rounded-lg border p-4"
      aria-labelledby={headingId}
    >
      <UserSearchBar
        className="space-y-3 p-0"
        headingId={headingId}
        inputId={inputId}
        isGuest={isGuest}
        query={query}
        onQueryChange={setQuery}
      />

      <UserSearchResultsPane
        idPrefix={`user-search-${id}`}
        isGuest={isGuest}
        canSearch={canSearch}
        showLoading={showLoading}
        parsedError={parsedError}
        data={data}
        selectedUserId={selectedRecipient?.userId ?? null}
        onSelectUser={handleSelectUser}
      />

      <div className="space-y-3">
        {selectedRecipient?.conversationId && (
          <div className="border-border space-y-3 rounded-lg border border-dashed p-4">
            <div>
              <h3 className="text-foreground text-sm font-medium">Existing direct chat</h3>
              <p className="text-muted mt-1 text-xs">
                Conversation ID:{' '}
                <code className="text-accent break-all font-mono text-[11px]">
                  {selectedRecipient.conversationId}
                </code>
              </p>
            </div>
            <FollowUpThreadComposer
              key={selectedRecipient.conversationId}
              conversationId={selectedRecipient.conversationId}
              peerUserId={selectedRecipient.userId}
              threadLabel={threadLabelFor(selectedRecipient)}
            />
          </div>
        )}

        {selectedRecipient && !selectedRecipient.conversationId && (
          <div className="border-border space-y-3 rounded-lg border border-dashed p-4">
            <h3 className="text-foreground text-sm font-medium">
              {storedConversationId ? 'Continue thread' : 'New direct thread'}
            </h3>
            {!storedConversationId ? (
              <NewDirectThreadComposer
                key={selectedRecipient.userId}
                recipient={selectedRecipient}
                onConversationIdStored={setStoredConversationId}
              />
            ) : (
              <FollowUpThreadComposer
                key={storedConversationId}
                conversationId={storedConversationId}
                peerUserId={selectedRecipient.userId}
                threadLabel={threadLabelFor(selectedRecipient)}
              />
            )}
            {storedConversationId !== null && (
              <span className="sr-only" data-testid="stored-conversation-id">
                {storedConversationId}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
