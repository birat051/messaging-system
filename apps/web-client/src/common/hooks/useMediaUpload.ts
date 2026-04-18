import { useCallback, useRef, useState } from 'react';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { uploadMedia } from '@/common/api/mediaApi';
import type { MediaUploadResponse } from '@/common/types/mediaApi-types';
import type { UseMediaUploadResult } from '@/common/types/useMediaUpload-types';
import { buildMediaUploadFormData } from '@/common/utils/buildMediaUploadFormData';

export type { UseMediaUploadResult, UseMediaUploadState } from '@/common/types/useMediaUpload-types';

/**
 * Thin wrapper around **`uploadMedia`** (`**POST /media/upload**`) — **`FormData`**, **`MediaUploadResponse`**
 * (`key`, `bucket`, optional **`url`**), **`progress`** (0–100, **`null`** when idle), **`error`** (parsed API message),
 * Axios **`onUploadProgress`** (skipped in **`MODE === 'test'`** only), **`AbortController`** cancel, **`retryUpload`**.
 * **No** AWS SDK in **`package.json`** — browser talks to the API only.
 */
export function useMediaUpload(): UseMediaUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MediaUploadResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    lastFileRef.current = null;
    setIsUploading(false);
    setProgress(null);
    setError(null);
    setResult(null);
  }, []);

  const upload = useCallback(
    async (file: File): Promise<MediaUploadResponse> => {
      abortRef.current?.abort();
      setError(null);
      setResult(null);
      setProgress(0);
      setIsUploading(true);
      lastFileRef.current = file;
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const fd = buildMediaUploadFormData(file);
        /** Axios **fetch** adapter (Vitest) + **`onUploadProgress`** can stall MSW multipart — omit here only in test; **`mediaApi.test.ts`** still covers percent math via mocked **`post`**. */
        const testMode = import.meta.env.MODE === 'test';
        const data = await uploadMedia(fd, {
          signal: ac.signal,
          contentLength: file.size,
          ...(testMode
            ? {}
            : { onUploadProgress: (pct: number) => setProgress(pct) }),
        });
        setResult(data);
        setProgress(100);
        lastFileRef.current = null;
        return data;
      } catch (e: unknown) {
        if (ac.signal.aborted) {
          throw e;
        }
        const msg = parseApiError(e).message;
        setError(msg);
        throw e;
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
        }
        setIsUploading(false);
      }
    },
    [],
  );

  const retryUpload = useCallback(async (): Promise<MediaUploadResponse | undefined> => {
    const f = lastFileRef.current;
    if (!f) {
      return undefined;
    }
    return upload(f);
  }, [upload]);

  return {
    isUploading,
    progress,
    error,
    result,
    upload,
    retryUpload,
    cancel,
    reset,
  };
}
