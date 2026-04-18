import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import type { components } from '@/generated/api-types';
import { searchUsers } from '@/common/api/usersApi';
import { usePrefetchRecipientPublicKey } from '@/common/hooks/usePrefetchRecipientPublicKey';
import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import { isValidUserSearchQuery } from '@/common/utils/formValidation';
import { useAuth } from '@/common/hooks/useAuth';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { ROUTES } from '@/routes/paths';
import { FollowUpThreadComposer } from './FollowUpThreadComposer';
import { NewDirectThreadComposer } from './NewDirectThreadComposer';
import { UserSearchResultList } from './UserSearchResultList';

type UserSearchResult = components['schemas']['UserSearchResult'];

/** Pause between keystrokes before calling **`GET /users/search`**. */
export const SEARCH_DEBOUNCE_MS = 400;

function threadLabelFor(user: UserSearchResult): string {
  const name = user.displayName?.trim();
  if (name) return name;
  const handle = user.username?.trim();
  if (handle) return `@${handle}`;
  return `User ${user.userId.slice(0, 8)}`;
}

export type UserSearchPanelProps = {
  /**
   * When **`true`**, styles for the left sidebar (no outer card border — sits under search in **`HomeConversationShell`**).
   */
  embedInSidebar?: boolean;
};

/**
 * Debounced search → **`GET /v1/users/search`**. For **guest** sessions the API returns **guest-scoped**
 * results only (registered users never appear). Loading / empty / error copy reflects that sandbox.
 */
export function UserSearchPanel({ embedInSidebar = false }: UserSearchPanelProps) {
  const { user } = useAuth();
  const isGuest = user?.guest === true;
  const id = useId();
  const headingId = `user-search-heading-${id}`;
  const inputId = `user-search-query-${id}`;

  const [query, setQuery] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<UserSearchResult | null>(null);
  /** Persisted from **`message:send`** ack **`Message.conversationId`** after the first send in a new thread. */
  const [storedConversationId, setStoredConversationId] = useState<string | null>(null);

  const debouncedTrimmed = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const normalizedQuery = debouncedTrimmed.toLowerCase();
  const canSearch = isValidUserSearchQuery(normalizedQuery);

  useEffect(() => {
    setSelectedRecipient(null);
  }, [normalizedQuery]);

  useEffect(() => {
    setStoredConversationId(null);
  }, [selectedRecipient?.userId]);

  const { data, error, isLoading, isValidating } = useSWR(
    canSearch ? (['users-search', normalizedQuery] as const) : null,
    ([, q]) => searchUsers({ query: q }),
    { revalidateOnFocus: false },
  );

  const showLoading = canSearch && (isLoading || isValidating);
  const parsedError = error ? parseApiError(error) : null;

  usePrefetchRecipientPublicKey(selectedRecipient?.userId);

  return (
    <section
      data-testid="user-search-panel"
      className={
        embedInSidebar
          ? 'space-y-3 p-3 sm:p-4'
          : 'border-border bg-background/50 space-y-3 rounded-lg border p-4'
      }
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-foreground text-sm font-medium">
        {isGuest ? 'Find other guests' : 'Find someone'}
      </h2>
      {isGuest ? (
        <p className="text-muted text-xs leading-snug">
          Registered accounts are not listed here — start chats with other guests, or register for the
          full directory.
        </p>
      ) : null}
      <div>
        <label htmlFor={inputId} className="sr-only">
          {isGuest ? 'Search guests' : 'Search users'}
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          placeholder={isGuest ? 'Search guests' : 'Search'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-border bg-background ring-ring focus:ring-accent/40 min-h-11 w-full rounded-md border px-3 py-2 text-base outline-none focus:ring-2 md:text-sm"
        />
      </div>

      <div aria-live="polite" className="text-sm">
        {canSearch && showLoading && (
          <p className="text-foreground" role="status" aria-busy="true">
            {isGuest ? 'Searching guests…' : 'Searching…'}
          </p>
        )}

        {canSearch && !showLoading && parsedError && (
          <div className="space-y-2" role="alert">
            <p className="text-red-600 dark:text-red-400">{parsedError.message}</p>
            {isGuest ? (
              <p className="text-muted text-xs">
                Guest search never includes registered users.{' '}
                <Link
                  to={ROUTES.register}
                  className="text-accent font-medium underline-offset-4 hover:underline"
                >
                  Register
                </Link>{' '}
                to use the full directory if you need it.
              </p>
            ) : null}
          </div>
        )}

        {canSearch && !showLoading && !parsedError && data && data.length === 0 && (
          <p className="text-muted" role="status">
            {isGuest ? (
              <>
                No other guests match that text. Invite a friend to try as a guest, or{' '}
                <Link
                  to={ROUTES.register}
                  className="text-accent font-medium underline-offset-4 hover:underline"
                >
                  create an account
                </Link>{' '}
                to search the full directory.
              </>
            ) : (
              'No users match that search text.'
            )}
          </p>
        )}

        {canSearch && !showLoading && !parsedError && data && data.length > 0 && (
          <div className="space-y-3">
            <p className="text-foreground" role="status">
              {isGuest ? (
                <>
                  Found {data.length} other {data.length === 1 ? 'guest' : 'guests'}.
                </>
              ) : (
                <>
                  Found {data.length} {data.length === 1 ? 'person' : 'people'}.
                </>
              )}
            </p>
            <UserSearchResultList
              results={data}
              idPrefix={`user-search-${id}`}
              isGuestDirectory={isGuest}
              selectedUserId={selectedRecipient?.userId ?? null}
              onSelectUser={setSelectedRecipient}
            />
          </div>
        )}

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
