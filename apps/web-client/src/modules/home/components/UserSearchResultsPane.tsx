import { Link } from 'react-router-dom';
import type { components } from '@/generated/api-types';
import { registerPathFromGuest } from '@/routes/paths';
import { UserSearchResultList } from './UserSearchResultList';

type UserSearchResult = components['schemas']['UserSearchResult'];

export type UserSearchResultsPaneProps = {
  idPrefix: string;
  isGuest: boolean;
  canSearch: boolean;
  showLoading: boolean;
  parsedError: { message: string } | null;
  data: UserSearchResult[] | undefined;
  selectedUserId: string | null;
  onSelectUser: (user: UserSearchResult) => void;
};

/**
 * Loading / empty / error / hit list for **`GET /users/search`**. In the home shell this replaces
 * **`ConversationList`** while a valid query is active.
 */
export function UserSearchResultsPane({
  idPrefix,
  isGuest,
  canSearch,
  showLoading,
  parsedError,
  data,
  selectedUserId,
  onSelectUser,
}: UserSearchResultsPaneProps) {
  return (
    <section
      data-testid="user-search-results"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label={isGuest ? 'Guest search results' : 'User search results'}
    >
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
                  to={registerPathFromGuest()}
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
                  to={registerPathFromGuest()}
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
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
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
              idPrefix={idPrefix}
              isGuestDirectory={isGuest}
              selectedUserId={selectedUserId}
              onSelectUser={onSelectUser}
            />
          </div>
        )}
      </div>
    </section>
  );
}
