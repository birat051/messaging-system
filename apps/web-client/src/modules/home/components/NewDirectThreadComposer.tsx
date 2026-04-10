import { type FormEvent, useState } from 'react';
import type { components } from '@/generated/api-types';
import { useSendMessage } from '@/common/hooks/useSendMessage';
import { parseApiError } from '@/modules/auth/utils/apiError';

type UserSearchResult = components['schemas']['UserSearchResult'];

type Props = {
  recipient: UserSearchResult;
  /** Called after the first message succeeds so the parent can persist `Message.conversationId`. */
  onConversationIdStored: (conversationId: string) => void;
};

/**
 * First message in a **new** 1:1 thread: **`message:send`** (socket) with **`recipientUserId`** only (no **`conversationId`**).
 * On success the parent unmounts this and shows **`FollowUpThreadComposer`**.
 */
export function NewDirectThreadComposer({ recipient, onConversationIdStored }: Props) {
  const { sendMessage } = useSendMessage();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;

    const previous = body;
    setBody('');
    setSending(true);
    setError(null);
    try {
      const message = await sendMessage({
        recipientUserId: recipient.userId,
        body: text,
      });
      onConversationIdStored(message.conversationId);
    } catch (err) {
      setBody(previous);
      setError(parseApiError(err).message);
    } finally {
      setSending(false);
    }
  }

  const label = recipient.displayName?.trim() || `User ${recipient.userId.slice(0, 8)}`;

  return (
    <form
      className="space-y-2"
      onSubmit={handleSubmit}
      aria-label={`Send first message to ${label}`}
    >
      <label htmlFor="new-direct-thread-body" className="text-foreground text-sm font-medium">
        Message
      </label>
      <textarea
        id="new-direct-thread-body"
        name="body"
        rows={3}
        value={body}
        onChange={(ev) => setBody(ev.target.value)}
        placeholder="Write a message…"
        className="border-border bg-background ring-ring focus:ring-accent/40 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        disabled={sending}
      />
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={sending || !body.trim()}
        aria-busy={sending}
        className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
