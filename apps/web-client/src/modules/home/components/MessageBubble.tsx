import type { ReactNode } from 'react';

export type MessageBubbleProps = {
  isOwn: boolean;
  children: ReactNode;
};

/**
 * Rounded message bubble shell for thread rows (**checklists / UX** refer to this as **MessageBubble**).
 * Text is **`children`**; **`ThreadMessageMedia`** is rendered by **`ThreadMessageList`** when **`mediaKey`** is set.
 */
export function MessageBubble({ isOwn, children }: MessageBubbleProps) {
  return (
    <div
      className={
        isOwn
          ? 'bg-primary text-primary-foreground min-w-0 max-w-full rounded-2xl rounded-br-md px-3 py-2 shadow-sm'
          : 'bg-surface text-foreground border-border min-w-0 max-w-full rounded-2xl rounded-bl-md border px-3 py-2 shadow-sm'
      }
    >
      {children}
    </div>
  );
}
