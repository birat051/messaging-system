import { useEffect, useId, useState } from 'react';
import useSWR from 'swr';
import type { components } from '@/generated/api-types';
import { searchUsersByEmail } from '@/common/api/usersApi';
import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import { isValidEmail } from '@/common/utils/formValidation';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { FollowUpThreadComposer } from './FollowUpThreadComposer';
import { NewDirectThreadComposer } from './NewDirectThreadComposer';
import { UserSearchResultList } from './UserSearchResultList';

type UserSearchResult = components['schemas']['UserSearchResult'];

const SEARCH_DEBOUNCE_MS = 400;

function threadLabelFor(user: UserSearchResult): string {
  const name = user.displayName?.trim();
  if (name) return name;
  return `User ${user.userId.slice(0, 8)}`;
}

/**
 * Debounced email field → **`GET /users/search`** — loading / empty / error states (exact match on server).
 */
export function UserSearchPanel() {
  const id = useId();
  const headingId = `user-search-heading-${id}`;
  const inputId = `user-search-email-${id}`;

  const [email, setEmail] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<UserSearchResult | null>(null);
  /** Persisted from **`message:send`** ack **`Message.conversationId`** after the first send in a new thread. */
  const [storedConversationId, setStoredConversationId] = useState<string | null>(null);

  const debouncedEmail = useDebouncedValue(email.trim(), SEARCH_DEBOUNCE_MS);
  const canSearch = isValidEmail(debouncedEmail);

  useEffect(() => {
    setSelectedRecipient(null);
  }, [debouncedEmail]);

  useEffect(() => {
    setStoredConversationId(null);
  }, [selectedRecipient?.userId]);

  const { data, error, isLoading, isValidating } = useSWR(
    canSearch ? (['users-search', debouncedEmail] as const) : null,
    ([, q]) => searchUsersByEmail({ email: q }),
    { revalidateOnFocus: false },
  );

  const showLoading = canSearch && (isLoading || isValidating);
  const parsedError = error ? parseApiError(error) : null;

  return (
    <section
      data-testid="user-search-panel"
      className="border-border bg-background/50 space-y-3 rounded-lg border p-4"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-foreground text-sm font-medium">
        Find someone by email
      </h2>
      <div>
        <label htmlFor={inputId} className="sr-only">
          Email address to search
        </label>
        <input
          id={inputId}
          type="email"
          autoComplete="off"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
        <p className="text-muted mt-1 text-xs">
          Exact match only — pause typing; search runs after you stop for a moment.
        </p>
      </div>

      <div aria-live="polite" className="min-h-[1.5rem] text-sm">
        {!email.trim() && (
          <p className="text-muted">Enter a full email address to search.</p>
        )}

        {email.trim() && !canSearch && (
          <p className="text-muted" role="status">
            Enter a valid email address.
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
            No user found with that email.
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
