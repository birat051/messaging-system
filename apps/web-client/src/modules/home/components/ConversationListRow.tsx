export type ConversationListRowProps = {
  title: string;
  subtitle?: string;
  /** When true, this row is the active conversation (e.g. open thread). */
  isActive?: boolean;
  onSelect?: () => void;
};

/**
 * Single row in a conversation list — selectable, with optional preview line.
 */
export function ConversationListRow({
  title,
  subtitle,
  isActive = false,
  onSelect,
}: ConversationListRowProps) {
  return (
    <button
      type="button"
      className={`focus:ring-accent/40 flex min-h-11 w-full touch-manipulation items-start rounded-lg border px-3 py-3 text-left text-sm outline-none transition focus:ring-2 sm:px-4 ${
        isActive
          ? 'border-accent bg-accent/10 text-foreground'
          : 'border-border bg-surface hover:bg-background/80'
      }`}
      aria-pressed={isActive}
      onClick={onSelect}
    >
      <div className="text-foreground font-medium">{title}</div>
      {subtitle ? (
        <div className="text-muted line-clamp-1 text-xs">{subtitle}</div>
      ) : null}
    </button>
  );
}
