import { type FormEvent, useId, useState } from 'react';
import type { components } from '@/generated/api-types';
import { useComposerMediaAttachment } from '@/common/hooks/useComposerMediaAttachment';
import { useSendEncryptedMessage } from '@/common/hooks/useSendEncryptedMessage';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { ComposerAttachmentToolbar } from './ComposerAttachmentToolbar';

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
  const { sendMessage } = useSendEncryptedMessage();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const fileInputId = `new-direct-file-${id}`;

  const attachment = useComposerMediaAttachment();

  const trimmed = body.trim();
  const mediaKey = attachment.mediaKey;
  const canSend =
    (trimmed.length > 0 || mediaKey !== null) &&
    !sending &&
    !attachment.isUploading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) {
      return;
    }

    const previous = body;
    setSending(true);
    setError(null);
    try {
      const message = await sendMessage({
        recipientUserId: recipient.userId,
        body: trimmed.length > 0 ? trimmed : undefined,
        mediaKey: mediaKey ?? undefined,
      });
      setBody('');
      attachment.clearAttachment();
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
      <ComposerAttachmentToolbar
        fileInputId={fileInputId}
        fileInputRef={attachment.fileInputRef}
        fileName={attachment.fileName}
        openFilePicker={attachment.openFilePicker}
        onFileInputChange={attachment.onFileInputChange}
        clearAttachment={attachment.clearAttachment}
        isUploading={attachment.isUploading}
        progress={attachment.progress}
        error={attachment.error}
        cancelUpload={attachment.cancelUpload}
        mediaKey={attachment.mediaKey}
        retryUpload={attachment.retryUpload}
      />
      <textarea
        id="new-direct-thread-body"
        name="body"
        rows={3}
        value={body}
        onChange={(ev) => setBody(ev.target.value)}
        placeholder="Write a message…"
        className="border-border bg-background ring-ring focus:ring-accent/40 w-full resize-y rounded-md border px-3 py-2 text-base outline-none focus:ring-2 md:text-sm"
        disabled={sending}
      />
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSend}
        aria-busy={sending}
        className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 min-h-11 touch-manipulation rounded-md px-4 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
