import type { ChangeEvent, Ref } from 'react';
import type { UseComposerMediaAttachmentResult } from '@/common/types/useComposerMediaAttachment-types';

export type ComposerAttachmentToolbarProps = Pick<
  UseComposerMediaAttachmentResult,
  | 'fileInputRef'
  | 'fileName'
  | 'openFilePicker'
  | 'onFileInputChange'
  | 'clearAttachment'
  | 'isUploading'
  | 'progress'
  | 'error'
  | 'cancelUpload'
  | 'mediaKey'
  | 'retryUpload'
> & {
  /** Passed to **`input type="file"`** — default allows common media types. */
  accept?: string;
  /** **`id` / `aria-controls`** wiring for the hidden input. */
  fileInputId: string;
};

const defaultAccept = 'image/*,video/*,audio/*';

function clampPercent(p: number | null): number {
  if (p === null) {
    return 0;
  }
  return Math.min(100, Math.max(0, p));
}

/**
 * Attach control, **determinate progress bar** (Axios upload progress), cancel, **retry** after failure, and error alert.
 */
export function ComposerAttachmentToolbar({
  fileInputRef,
  fileName,
  openFilePicker,
  onFileInputChange,
  clearAttachment,
  isUploading,
  progress,
  error,
  cancelUpload,
  mediaKey,
  retryUpload,
  accept = defaultAccept,
  fileInputId,
}: ComposerAttachmentToolbarProps) {
  const hasPending =
    fileName !== null ||
    isUploading ||
    error !== null ||
    mediaKey !== null;

  const pct = clampPercent(progress);
  const showRetry = Boolean(error && !isUploading && fileName && !mediaKey);

  return (
    <div className="flex flex-col gap-2">
      <input
        id={fileInputId}
        ref={fileInputRef as Ref<HTMLInputElement>}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept}
        aria-hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          void onFileInputChange(e);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openFilePicker}
          disabled={isUploading}
          aria-controls={fileInputId}
          aria-label="Attach a file"
          className="border-border text-foreground hover:bg-surface/80 focus:ring-accent/50 shrink-0 rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Attach file
        </button>
        {isUploading ? (
          <button
            type="button"
            onClick={cancelUpload}
            className="text-muted hover:text-foreground text-xs underline"
          >
            Cancel upload
          </button>
        ) : null}
        {hasPending && !isUploading && fileName ? (
          <span className="text-muted min-w-0 truncate text-xs" title={fileName}>
            {fileName}
            {mediaKey ? ' — ready' : ''}
          </span>
        ) : null}
        {hasPending && !isUploading ? (
          <button
            type="button"
            onClick={clearAttachment}
            className="text-muted hover:text-foreground text-xs underline"
          >
            Remove
          </button>
        ) : null}
      </div>
      {isUploading ? (
        <div className="max-w-md space-y-1">
          <p className="text-muted text-xs tabular-nums" aria-live="polite" aria-busy="true">
            Uploading {pct}%
          </p>
          <div
            className="bg-muted h-2 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Upload progress"
          >
            <div
              className="bg-accent h-full transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <p
            role="alert"
            className="text-sm text-red-600 dark:text-red-400 min-w-0"
          >
            {error}
          </p>
          {showRetry ? (
            <button
              type="button"
              onClick={() => {
                void retryUpload();
              }}
              className="border-border text-foreground hover:bg-surface/80 focus:ring-accent/50 shrink-0 rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2"
            >
              Retry upload
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
