import { type FormEvent, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { SendIcon } from '@/common/components/SendIcon';
import type { components } from '@/generated/api-types';
import { useAuth } from '@/common/hooks/useAuth';
import { useComposerMediaAttachment } from '@/common/hooks/useComposerMediaAttachment';
import { useSendEncryptedMessage } from '@/common/hooks/useSendEncryptedMessage';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { recordOwnSendPlaintext } from '@/modules/home/stores/messagingSlice';
import { registerPathFromGuest } from '@/routes/paths';
import { useAppDispatch } from '@/store/hooks';
import { ComposerImagePreviewStrip } from './ComposerImagePreviewStrip';
import {
  ComposerAttachButton,
  ComposerAttachmentToolbar,
} from './ComposerAttachmentToolbar';

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
  const dispatch = useAppDispatch();
  const { user } = useAuth();
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
      if (trimmed.length > 0) {
        dispatch(
          recordOwnSendPlaintext({
            messageId: message.id,
            plaintext: trimmed,
          }),
        );
      }
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

  const showGuestRegisterHint =
    user?.guest === true &&
    error !== null &&
    /guests can only message other guests/i.test(error);

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
        attachButtonPlacement="external"
      />
      <ComposerImagePreviewStrip url={attachment.imagePreviewUrl} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <textarea
          id="new-direct-thread-body"
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
        <div className="space-y-2">
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
          {showGuestRegisterHint ? (
            <p className="text-muted text-xs">
              <Link
                to={registerPathFromGuest()}
                className="text-accent font-medium underline-offset-4 hover:underline"
              >
                Register
              </Link>{' '}
              to message registered users and use the full directory.
            </p>
          ) : null}
        </div>
      )}
    </form>
  );
}
