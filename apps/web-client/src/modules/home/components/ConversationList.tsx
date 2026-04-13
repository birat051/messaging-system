import { useId } from 'react';
import { ConversationListRow } from './ConversationListRow';

export type ConversationListItem = {
  id: string;
  title: string;
  subtitle?: string;
};

export type ConversationListProps = {
  items: ConversationListItem[];
  /** When true and there are no items yet, show a loading state (initial fetch). */
  isLoading?: boolean;
  /** When set, show an error alert instead of the list. */
  errorMessage?: string | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Shown when not loading, no error, and `items` is empty. */
  emptyLabel?: string;
  /** Extra classes on the root **`section`** (e.g. embedded in **`HomeConversationShell`**). */
  className?: string;
};

/**
 * Conversation sidebar / list — **empty**, **loading**, and **error** states for production list APIs.
 */
export function ConversationList({
  items,
  isLoading = false,
  errorMessage = null,
  selectedId = null,
  onSelect,
  emptyLabel = 'No conversations yet',
  className = '',
}: ConversationListProps) {
  const headingId = useId();
  const showInitialLoad = isLoading && items.length === 0;
  const showEmpty =
    !errorMessage && !showInitialLoad && items.length === 0;

  const rootClass = [
    'border-border bg-background/40 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={rootClass} aria-labelledby={headingId}>
      <h2 id={headingId} className="text-foreground sr-only">
        Conversations
      </h2>

      {errorMessage ? (
        <div
          role="alert"
          aria-live="assertive"
          className="m-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
        >
          {errorMessage}
        </div>
      ) : showInitialLoad ? (
        <p
          className="text-muted m-3 text-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          Loading conversations…
        </p>
      ) : showEmpty ? (
        <p className="text-muted m-3 text-sm" role="status" aria-live="polite">
          {emptyLabel}
        </p>
      ) : (
        <ul className="divide-border min-h-0 flex-1 divide-y overflow-y-auto p-1.5 sm:p-2">
          {items.map((c) => (
            <li key={c.id}>
              <ConversationListRow
                title={c.title}
                subtitle={c.subtitle}
                isActive={c.id === selectedId}
                onSelect={onSelect ? () => onSelect(c.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
