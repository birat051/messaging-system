export type UserSearchBarProps = {
  headingId: string;
  inputId: string;
  isGuest: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  /** Merged onto the outer **`section`** (e.g. **`p-0`** when the card wrapper supplies padding). */
  className?: string;
};

/**
 * Search field strip for **`HomeConversationShell`** — sits **above** the thread pane; results render in the list column.
 */
export function UserSearchBar({
  headingId,
  inputId,
  isGuest,
  query,
  onQueryChange,
  className,
}: UserSearchBarProps) {
  const guestBlurb = isGuest ? (
    <p className="text-muted text-xs leading-snug">
      Registered accounts are not listed here — start chats with other guests, or register for the
      full directory.
    </p>
  ) : null;

  return (
    <section
      data-testid="user-search-bar"
      className={
        className ??
        'shrink-0 space-y-3 p-3 sm:p-4'
      }
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-foreground text-sm font-medium">
        {isGuest ? 'Find other guests' : 'Find someone'}
      </h2>
      {guestBlurb}
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
          onChange={(e) => onQueryChange(e.target.value)}
          className="border-border bg-background ring-ring focus:ring-accent/40 min-h-11 w-full rounded-md border px-3 py-2 text-base outline-none focus:ring-2 md:text-sm"
        />
      </div>
    </section>
  );
}
