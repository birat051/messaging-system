import type { MediaUploadResponse } from './mediaApi-types';

export type UseMediaUploadState = {
  isUploading: boolean;
  /** 0–100 while uploading; **`null`** when idle or after completion. */
  progress: number | null;
  error: string | null;
  result: MediaUploadResponse | null;
};

export type UseMediaUploadResult = UseMediaUploadState & {
  upload: (file: File) => Promise<MediaUploadResponse>;
  /** Re-runs **`upload`** with the last file after a failed or cancelled attempt (no-op if none). */
  retryUpload: () => Promise<MediaUploadResponse | undefined>;
  cancel: () => void;
  reset: () => void;
};
