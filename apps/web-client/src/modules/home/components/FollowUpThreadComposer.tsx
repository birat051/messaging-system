import { type FormEvent, useId, useState } from 'react';
import { SendIcon } from '@/common/components/SendIcon';
import type { components } from '@/generated/api-types';
import { useComposerMediaAttachment } from '@/common/hooks/useComposerMediaAttachment';
import { useSendEncryptedMessage } from '@/common/hooks/useSendEncryptedMessage';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { ComposerImagePreviewStrip } from './ComposerImagePreviewStrip';
import {
  ComposerAttachButton,
  ComposerAttachmentToolbar,
} from './ComposerAttachmentToolbar';

type Message = components['schemas']['Message'];

type Props = {
  /** Existing thread — required; `recipientUserId` must not be sent. */
  conversationId: string;
  /** Other participant — used to load their directory public key for ECIES. */
  peerUserId: string;
  /** Accessible name for the thread (e.g. counterparty display name). */
  threadLabel: string;
};

/**
 * Further messages in an existing 1:1 thread: **`message:send`** (socket) with **`conversationId`** only
 * (omit **`recipientUserId`**).
 */
export function FollowUpThreadComposer({
  conversationId,
  peerUserId,
  threadLabel,
}: Props) {
  const { sendMessage } = useSendEncryptedMessage({ peerUserId });
  const fieldId = useId();
  const fileInputId = `follow-up-file-${fieldId}`;
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<Message | null>(null);

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
        conversationId,
        body: trimmed.length > 0 ? trimmed : undefined,
        mediaKey: mediaKey ?? undefined,
        ...(attachment.mediaRetrievableUrl?.trim()
          ? { mediaRetrievableUrl: attachment.mediaRetrievableUrl.trim() }
          : {}),
      });
      setBody('');
      attachment.clearAttachment();
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
          attachButtonPlacement="external"
        />
        <ComposerImagePreviewStrip url={attachment.imagePreviewUrl} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <textarea
            id={fieldId}
            name="body"
            rows={3}
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            placeholder="Write a message…"
            className="border-border bg-background ring-ring focus:ring-accent/40 min-w-0 w-full flex-1 resize-y rounded-md border px-3 py-2 text-base outline-none focus:ring-2 md:text-sm"
            disabled={sending}
          />
          <ComposerAttachButton
            fileInputId={fileInputId}
            openFilePicker={attachment.openFilePicker}
            disabled={attachment.isUploading || sending}
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-busy={sending}
            aria-label={sending ? 'Sending message' : 'Send message'}
            title={sending ? 'Sending…' : 'Send message'}
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-accent/50 inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-md px-2.5 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
          >
            {sending ? (
              <span
                className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current/30 border-t-current"
                aria-hidden
              />
            ) : (
              <SendIcon className="h-5 w-5" />
            )}
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </form>
      {lastSent && (
        <p className="text-muted text-xs" role="status" aria-live="polite">
          Sent (message <code className="text-accent font-mono text-[11px]">{lastSent.id}</code>).
        </p>
      )}
    </div>
  );
}
