import { useEffect, useId, useState } from 'react';
import useSWR from 'swr';
import type { components } from '@/generated/api-types';
import { searchUsersByEmail } from '@/common/api/usersApi';
import { usePrefetchRecipientPublicKey } from '@/common/hooks/usePrefetchRecipientPublicKey';
import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import {
  isValidUserSearchEmailQuery,
  USER_SEARCH_EMAIL_QUERY_MIN_LENGTH,
} from '@/common/utils/formValidation';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { FollowUpThreadComposer } from './FollowUpThreadComposer';
import { NewDirectThreadComposer } from './NewDirectThreadComposer';
import { UserSearchResultList } from './UserSearchResultList';

type UserSearchResult = components['schemas']['UserSearchResult'];

/** Pause between keystrokes before calling **`GET /users/search`** (substring match on email). */
export const SEARCH_DEBOUNCE_MS = 400;

function threadLabelFor(user: UserSearchResult): string {
  const name = user.displayName?.trim();
  if (name) return name;
  return `User ${user.userId.slice(0, 8)}`;
}

export type UserSearchPanelProps = {
  /**
   * When **`true`**, styles for the left sidebar (no outer card border — sits under search in **`HomeConversationShell`**).
   */
  embedInSidebar?: boolean;
};

/**
 * Debounced search field → **`GET /users/search`** — loading / empty / error states (partial email match on server).
 */
export function UserSearchPanel({ embedInSidebar = false }: UserSearchPanelProps) {
  const id = useId();
  const headingId = `user-search-heading-${id}`;
  const inputId = `user-search-email-${id}`;

  const [email, setEmail] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<UserSearchResult | null>(null);
  /** Persisted from **`message:send`** ack **`Message.conversationId`** after the first send in a new thread. */
  const [storedConversationId, setStoredConversationId] = useState<string | null>(null);

  const debouncedTrimmed = useDebouncedValue(email.trim(), SEARCH_DEBOUNCE_MS);
  const normalizedQuery = debouncedTrimmed.toLowerCase();
  const canSearch = isValidUserSearchEmailQuery(normalizedQuery);

  useEffect(() => {
    setSelectedRecipient(null);
  }, [normalizedQuery]);

  useEffect(() => {
    setStoredConversationId(null);
  }, [selectedRecipient?.userId]);

  const { data, error, isLoading, isValidating } = useSWR(
    canSearch ? (['users-search', normalizedQuery] as const) : null,
    ([, q]) => searchUsersByEmail({ email: q }),
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
        Find someone by email
      </h2>
      <div>
        <label htmlFor={inputId} className="sr-only">
          Email text to search (partial match)
        </label>
        <input
          id={inputId}
          type="text"
          inputMode="email"
          autoComplete="off"
          placeholder="e.g. ann, @company.com, or full address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-border bg-background ring-ring focus:ring-accent/40 min-h-11 w-full rounded-md border px-3 py-2 text-base outline-none focus:ring-2 md:text-sm"
        />
        <p className="text-muted mt-1 text-xs">
          Matches any part of a stored email. Pause typing; search runs after you stop for a moment.
        </p>
      </div>

      <div aria-live="polite" className="min-h-[1.5rem] text-sm">
        {!email.trim() && (
          <p className="text-muted">
            Enter at least {USER_SEARCH_EMAIL_QUERY_MIN_LENGTH} characters (letters, digits, and
            @._+-).
          </p>
        )}

        {email.trim() &&
          !canSearch &&
          normalizedQuery.length < USER_SEARCH_EMAIL_QUERY_MIN_LENGTH && (
          <p className="text-muted" role="status">
            Enter at least {USER_SEARCH_EMAIL_QUERY_MIN_LENGTH} characters to search (partial email
            is fine).
          </p>
        )}

        {email.trim() &&
          !canSearch &&
          normalizedQuery.length >= USER_SEARCH_EMAIL_QUERY_MIN_LENGTH && (
          <p className="text-muted" role="status">
            Use only letters, digits, and @._+-.
          </p>
        )}

        {canSearch && showLoading && (
          <p className="text-foreground" role="status" aria-busy="true">
            Searching…
          </p>
        )}

        {canSearch && !showLoading && parsedError && (
          <p className="text-red-600 dark:text-red-400" role="alert">
            {parsedError.message}
          </p>
        )}

        {canSearch && !showLoading && !parsedError && data && data.length === 0 && (
          <p className="text-muted" role="status">
            No users match that search text.
          </p>
        )}

        {canSearch && !showLoading && !parsedError && data && data.length > 0 && (
          <div className="space-y-3">
            <p className="text-foreground" role="status">
              Found {data.length} {data.length === 1 ? 'person' : 'people'}.
            </p>
            <UserSearchResultList
              results={data}
              idPrefix={`user-search-${id}`}
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
