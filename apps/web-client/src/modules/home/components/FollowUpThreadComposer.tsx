import { type FormEvent, useId, useState } from 'react';
import type { components } from '@/generated/api-types';
import { useSendMessage } from '@/common/hooks/useSendMessage';
import { parseApiError } from '@/modules/auth/utils/apiError';

type Message = components['schemas']['Message'];

type Props = {
  /** Existing thread — required; `recipientUserId` must not be sent. */
  conversationId: string;
  /** Accessible name for the thread (e.g. counterparty display name). */
  threadLabel: string;
};

/**
 * Further messages in an existing 1:1 thread: **`message:send`** (socket) with **`conversationId`** only
 * (omit **`recipientUserId`**).
 */
export function FollowUpThreadComposer({ conversationId, threadLabel }: Props) {
  const { sendMessage } = useSendMessage();
  const fieldId = useId();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<Message | null>(null);

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
        conversationId,
        body: text,
      });
      setLastSent(message);
    } catch (err) {
      setBody(previous);
      setError(parseApiError(err).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <form
        className="space-y-2"
        onSubmit={handleSubmit}
        aria-label={`Send message in thread with ${threadLabel}`}
      >
        <label htmlFor={fieldId} className="text-foreground text-sm font-medium">
          Message
        </label>
        <textarea
          id={fieldId}
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
      {lastSent && (
        <p className="text-muted text-xs" role="status" aria-live="polite">
          Sent (message <code className="text-accent font-mono text-[11px]">{lastSent.id}</code>).
        </p>
      )}
    </div>
  );
}
