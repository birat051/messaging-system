import { type FormEvent, useId, useState } from 'react';
import { SendIcon } from '@/common/components/SendIcon';
import { useComposerMediaAttachment } from '@/common/hooks/useComposerMediaAttachment';
import type { ThreadComposerSendPayload } from '../types/ThreadComposer-types';
import { ComposerImagePreviewStrip } from './ComposerImagePreviewStrip';
import {
  ComposerAttachButton,
  ComposerAttachmentToolbar,
} from './ComposerAttachmentToolbar';

export type ThreadComposerProps = {
  onSend: (payload: ThreadComposerSendPayload) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  /** External error (e.g. server / socket) — shown with **`submitError`** from failed **`onSend`**. */
  errorMessage?: string | null;
  /** Called when the user edits the field while **`errorMessage`** is set (e.g. clear Redux send error). */
  onExternalErrorClear?: () => void;
};

/**
 * Message input + send — trimmed body and/or **`mediaKey`** from **`POST /media/upload`**;
 * **`mediaPreviewUrl`** (blob or API **`url`**) is passed for optimistic thread display only — **`message:send`** still sends **`mediaKey`** (**no** browser S3).
 * Send disabled when empty (no text and no uploaded attachment), while upload is in flight, or while **`onSend`** runs.
 */
export function ThreadComposer({
  onSend,
  placeholder = 'Type a message…',
  disabled = false,
  errorMessage = null,
  onExternalErrorClear,
}: ThreadComposerProps) {
  const id = useId();
  const fieldId = `thread-composer-message-${id}`;
  const fileInputId = `thread-composer-file-${id}`;
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const attachment = useComposerMediaAttachment();

  const trimmed = value.trim();
  const hasContent =
    trimmed.length > 0 || attachment.mediaKey !== null;
  const sendDisabled =
    disabled ||
    submitting ||
    attachment.isUploading ||
    !hasContent;

  const displayError = errorMessage ?? submitError;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (sendDisabled) {
      return;
    }

    const text = trimmed;
    const mediaKey = attachment.mediaKey;
    if (!text && !mediaKey) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await Promise.resolve(
        onSend({
          text,
          mediaKey: mediaKey ?? null,
          mediaPreviewUrl: attachment.mediaPreviewUrl ?? null,
        }),
      );
      setValue('');
      attachment.clearAttachment();
    } catch (e: unknown) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not send message',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      {displayError ? (
        <p
          role="alert"
          className="min-w-0 break-words text-sm text-red-600 dark:text-red-400"
        >
          {displayError}
        </p>
      ) : null}
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
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={handleSubmit}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={fieldId} className="sr-only">
            Message
          </label>
          <textarea
            id={fieldId}
            name="message"
            rows={2}
            value={value}
            disabled={disabled || submitting}
            placeholder={placeholder}
            onChange={(e) => {
              setValue(e.target.value);
              if (submitError) {
                setSubmitError(null);
              }
              if (errorMessage) {
                onExternalErrorClear?.();
              }
            }}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full resize-y rounded-md border px-3 py-2 text-base outline-none focus:ring-2 md:text-sm"
          />
        </div>
        <ComposerAttachButton
          fileInputId={fileInputId}
          openFilePicker={attachment.openFilePicker}
          disabled={
            attachment.isUploading || disabled || submitting
          }
        />
        <button
          type="submit"
          disabled={sendDisabled}
          aria-busy={submitting}
          aria-label={submitting ? 'Sending message' : 'Send message'}
          title={submitting ? 'Sending…' : 'Send message'}
          className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-md px-2.5 text-sm font-medium outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <span
              className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current/30 border-t-current"
              aria-hidden
            />
          ) : (
            <SendIcon className="h-5 w-5" />
          )}
        </button>
      </form>
    </div>
  );
}
