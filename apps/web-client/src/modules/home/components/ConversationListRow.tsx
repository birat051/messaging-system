import {
  peerPresenceTextClassName,
  type PeerPresenceDisplay,
} from '@/modules/home/utils/peerPresenceDisplay';
import { conversationListAvatarInitials } from '@/modules/home/utils/conversationListPreview';

export type ConversationListRowProps = {
  title: string;
  subtitle?: string;
  /** Optional **Feature 6** last-seen / online line (direct threads). */
  presence?: PeerPresenceDisplay | null;
  /** **1–2** characters for the avatar circle; defaults from **`title`**. */
  avatarInitials?: string;
  /** When true, this row is the active conversation (e.g. open thread). */
  isActive?: boolean;
  onSelect?: () => void;
};

/**
 * Single row in a conversation list — **avatar**, **name**, and optional **truncated** preview line.
 */
export function ConversationListRow({
  title,
  subtitle,
  presence,
  avatarInitials,
  isActive = false,
  onSelect,
}: ConversationListRowProps) {
  const initials = (avatarInitials ?? conversationListAvatarInitials(title)).slice(0, 2);
  const showPresence =
    presence &&
    presence.variant !== 'hidden' &&
    presence.text &&
    presence.text.length > 0;

  return (
    <button
      type="button"
      className={`focus:ring-accent/40 flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm outline-none transition focus:ring-2 sm:px-4 ${
        isActive
          ? 'border-accent bg-accent/10 text-foreground'
          : 'border-border bg-surface hover:bg-background/80'
      }`}
      aria-pressed={isActive}
      onClick={onSelect}
    >
      <span
        className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        aria-hidden="true"
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block font-medium line-clamp-1">{title}</span>
        {showPresence ? (
          <span
            className={`mt-0.5 block line-clamp-1 text-xs ${peerPresenceTextClassName(presence.variant)}`}
          >
            {presence.text}
          </span>
        ) : null}
        {subtitle ? (
          <span
            className="text-muted mt-0.5 block line-clamp-1 text-xs"
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </button>
  );
}
