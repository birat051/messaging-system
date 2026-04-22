import type { ChangeEvent, RefObject } from 'react';

/**
 * Composes **`useMediaUpload`** with a hidden file input for composer attach flows.
 */
export type UseComposerMediaAttachmentResult = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  /** Selected file label (name) while an attachment is in play. */
  fileName: string | null;
  /**
   * **`blob:` URL** for a pending **image** (`image/*`) — **`null`** for video/audio or no file.
   * Revoked when the attachment clears or the hook unmounts.
   */
  imagePreviewUrl: string | null;
  /**
   * For **`sendMessage`** / optimistic UI: **`imagePreviewUrl`**, else **`MediaUploadResponse.url`** (HTTPS)
   * when the API returns one.
   */
  mediaPreviewUrl: string | null;
  /**
   * Upload response **`url`** only (no **`blob:`**) — passed into hybrid encrypt as **`mediaRetrievableUrl`**.
   */
  mediaRetrievableUrl: string | null;
  openFilePicker: () => void;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  clearAttachment: () => void;
  /** **`MediaUploadResponse.key`** — maps to **`SendMessageRequest.mediaKey`**. */
  mediaKey: string | null;
  isUploading: boolean;
  progress: number | null;
  error: string | null;
  cancelUpload: () => void;
  /** Re-runs upload for the same file after an error (from **`useMediaUpload.retryUpload`**). */
  retryUpload: () => Promise<void>;
};
