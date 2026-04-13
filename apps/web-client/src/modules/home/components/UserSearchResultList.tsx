import { useRef } from 'react';
import type { components } from '@/generated/api-types';

type UserSearchResult = components['schemas']['UserSearchResult'];

function initialsFromResult(user: UserSearchResult): string {
  const name = user.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const handle = user.username?.trim();
  if (handle) {
    return handle.slice(0, 2).toUpperCase();
  }
  return user.userId.slice(0, 2).toUpperCase();
}

function displayNameFor(user: UserSearchResult): string {
  const name = user.displayName?.trim();
  if (name) return name;
  const handle = user.username?.trim();
  if (handle) return `@${handle}`;
  return `User ${user.userId.slice(0, 8)}`;
}

function formatConversationHint(user: UserSearchResult): { text: string } {
  if (user.conversationId?.trim()) {
    const id = user.conversationId.trim();
    const short = id.length > 28 ? `${id.slice(0, 14)}…${id.slice(-8)}` : id;
    return {
      text: `Conversation ID: ${short}`,
    };
  }
  return {
    text: 'No conversation yet — first message will start a direct chat.',
  };
}

function UserSearchAvatar({ user }: { user: UserSearchResult }) {
  const initials = initialsFromResult(user);

  if (user.profilePicture) {
    return (
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-background">
        <img
          src={user.profilePicture}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }

  return (
    <span
      className="border-border bg-surface text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-medium"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

type Props = {
  results: UserSearchResult[];
  /** Prefix for stable ids (from parent useId) */
  idPrefix: string;
  /** Selected row for composer / keyboard highlight */
  selectedUserId: string | null;
  onSelectUser: (user: UserSearchResult) => void;
};

/**
 * Accessible list of search hits: avatar, display name, and direct-conversation hint.
 * Each row is a **button** (arrow keys move focus between rows; `aria-pressed` when selected).
 */
export function UserSearchResultList({
  results,
  idPrefix,
  selectedUserId,
  onSelectUser,
}: Props) {
  const listHeadingId = `${idPrefix}-results-heading`;
  const navHintId = `${idPrefix}-results-keyboard-hint`;
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div className="space-y-2">
      <h3 id={listHeadingId} className="sr-only">
        Search results
      </h3>
      <p id={navHintId} className="sr-only">
        When a result is focused, use arrow up and arrow down to move between results.
      </p>
      <ul
        className="m-0 list-none space-y-2 p-0"
        role="list"
        aria-labelledby={listHeadingId}
        aria-describedby={navHintId}
      >
        {results.map((user, index) => {
          const name = displayNameFor(user);
          const { text: convText } = formatConversationHint(user);
          const rowId = `${idPrefix}-result-${user.userId}-${index}`;
          const nameId = `${rowId}-name`;
          const hintId = `${rowId}-hint`;

          const isSelected = selectedUserId === user.userId;

          return (
            <li key={user.userId}>
              <button
                type="button"
                id={rowId}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                aria-labelledby={nameId}
                aria-describedby={hintId}
                aria-pressed={isSelected}
                onClick={() => onSelectUser(user)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    rowRefs.current[index + 1]?.focus();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    rowRefs.current[index - 1]?.focus();
                  }
                }}
                className={`border-border bg-background/80 focus-visible:ring-ring flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  isSelected ? 'ring-accent ring-2 ring-offset-2 ring-offset-background' : ''
                }`}
              >
                <UserSearchAvatar user={user} />
                <div className="min-w-0 flex-1">
                  <p id={nameId} className="text-foreground font-medium">
                    {name}
                  </p>
                  <p id={hintId} className="mt-0.5 text-xs">
                    <span className="text-foreground/90 font-mono text-[11px] tracking-tight">
                      {convText}
                    </span>
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
