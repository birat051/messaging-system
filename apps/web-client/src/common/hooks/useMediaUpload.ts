import { useCallback, useRef, useState } from 'react';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { uploadMediaViaPresignedPut } from '@/common/api/mediaApi';
import type { MediaUploadResponse } from '@/common/types/mediaApi-types';
import type { UseMediaUploadResult } from '@/common/types/useMediaUpload-types';

export type { UseMediaUploadResult, UseMediaUploadState } from '@/common/types/useMediaUpload-types';

/**
 * Chat media upload: **`POST /v1/media/presign`** then browser **`PUT`** to the returned URL (R2 / S3-compatible).
 * Same **`MediaUploadResponse`** shape, progress, errors, cancel, retry. Max size **`getMediaUploadMaxBytes()`** (**`mediaApi`**).
 * No AWS SDK in the browser.
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
        const testMode = import.meta.env.MODE === 'test';
        const progressCb = testMode
          ? undefined
          : (pct: number) => {
              setProgress(pct);
            };
        const data = await uploadMediaViaPresignedPut(file, {
          signal: ac.signal,
          contentLength: file.size,
          ...(progressCb ? { onUploadProgress: progressCb } : {}),
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
