import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { UseComposerMediaAttachmentResult } from '../types/useComposerMediaAttachment-types';
import {
  logMediaPreview,
  redactUrlForLog,
} from '@/common/utils/mediaPreviewDebug';
import { useMediaUpload } from './useMediaUpload';

function mediaKeySnippetForLog(key: string): string {
  const t = key.trim();
  if (t.length <= 52) {
    return t;
  }
  return `${t.slice(0, 24)}…${t.slice(-20)}`;
}

/**
 * Hidden file input + **`useMediaUpload`** — **`POST /v1/media/presign`** + **`PUT`** to R2 — yields **`mediaKey`** (**`key`**) for **`SendMessageRequest`**.
 */
export function useComposerMediaAttachment(): UseComposerMediaAttachmentResult {
  const {
    upload,
    retryUpload,
    cancel,
    reset,
    isUploading,
    progress,
    error,
    result,
  } = useMediaUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const imagePreviewUrlRef = useRef<string | null>(null);

  const replaceImagePreview = useCallback((next: string | null) => {
    const prevRef = imagePreviewUrlRef.current;
    if (prevRef) {
      URL.revokeObjectURL(prevRef);
      logMediaPreview('composer: revoke object URL', {
        previous: redactUrlForLog(prevRef),
      });
      imagePreviewUrlRef.current = null;
    }
    imagePreviewUrlRef.current = next;
    setImagePreviewUrl(next);
    if (next) {
      logMediaPreview('composer: set object URL', {
        next: redactUrlForLog(next),
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
        imagePreviewUrlRef.current = null;
      }
    };
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileInputChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) {
        return;
      }
      setFileName(file.name);
      reset();
      const blobUrl =
        file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      if (blobUrl) {
        logMediaPreview('composer: file picked → URL.createObjectURL', {
          name: file.name,
          mime: file.type,
          sizeBytes: file.size,
          blobUrlHint: redactUrlForLog(blobUrl),
        });
      } else {
        logMediaPreview('composer: non-image file — no object URL preview', {
          name: file.name,
          mime: file.type,
        });
      }
      replaceImagePreview(blobUrl);
      try {
        await upload(file);
      } catch {
        // **`useMediaUpload`** sets **`error`**
      }
    },
    [upload, reset, replaceImagePreview],
  );

  const clearAttachment = useCallback(() => {
    cancel();
    reset();
    setFileName(null);
    replaceImagePreview(null);
  }, [cancel, reset, replaceImagePreview]);

  const retryUploadAttachment = useCallback(async () => {
    try {
      await retryUpload();
    } catch {
      // **`useMediaUpload`** sets **`error`**
    }
  }, [retryUpload]);

  const key = result?.key?.trim();
  const mediaKey = key ? key : null;
  const uploadedMediaUrl = result?.url?.trim() ?? null;
  const mediaPreviewUrl = imagePreviewUrl ?? uploadedMediaUrl ?? null;

  useEffect(() => {
    logMediaPreview('composer: effective preview pipeline', {
      imagePreviewBlob: redactUrlForLog(imagePreviewUrl),
      uploadedUrl: redactUrlForLog(uploadedMediaUrl),
      mediaPreviewForSend: redactUrlForLog(mediaPreviewUrl),
      mediaKeyTail: mediaKey ? mediaKeySnippetForLog(mediaKey) : null,
    });
  }, [imagePreviewUrl, uploadedMediaUrl, mediaKey]);

  return {
    fileInputRef,
    fileName,
    imagePreviewUrl,
    mediaPreviewUrl,
    mediaRetrievableUrl: uploadedMediaUrl,
    openFilePicker,
    onFileInputChange,
    clearAttachment,
    mediaKey,
    isUploading,
    progress,
    error,
    cancelUpload: cancel,
    retryUpload: retryUploadAttachment,
  };
}
