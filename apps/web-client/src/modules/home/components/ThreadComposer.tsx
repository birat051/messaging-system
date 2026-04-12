import { type FormEvent, useId, useState } from 'react';

export type ThreadComposerProps = {
  onSend: (text: string) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  /** External error (e.g. server / socket) — shown with **`submitError`** from failed **`onSend`**. */
  errorMessage?: string | null;
  /** Called when the user edits the field while **`errorMessage`** is set (e.g. clear Redux send error). */
  onExternalErrorClear?: () => void;
};

/**
 * Message input + send — trimmed body; send disabled when empty or while **`onSend`** is in flight.
 * Surfaces **failed sends** and optional **parent-supplied** **`errorMessage`** (e.g. rate limits).
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
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmed = value.trim();
  const sendDisabled = disabled || submitting || trimmed.length === 0;

  const displayError = errorMessage ?? submitError;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (sendDisabled) return;

    const text = trimmed;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await Promise.resolve(onSend(text));
      setValue('');
    } catch (e: unknown) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not send message',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      {displayError ? (
        <p
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {displayError}
        </p>
      ) : null}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
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
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </div>
        <button
          type="submit"
          disabled={sendDisabled}
          aria-busy={submitting}
          className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 shrink-0 rounded-md px-4 py-2 text-sm font-medium outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
