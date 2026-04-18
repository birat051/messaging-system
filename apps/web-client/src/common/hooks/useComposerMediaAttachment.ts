import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { UseComposerMediaAttachmentResult } from '../types/useComposerMediaAttachment-types';
import { useMediaUpload } from './useMediaUpload';

/**
 * Hidden file input + **`POST /media/upload`** — yields **`mediaKey`** (**`key`**) for **`SendMessageRequest`**.
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
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }
    imagePreviewUrlRef.current = next;
    setImagePreviewUrl(next);
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
      replaceImagePreview(
        file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      );
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

  return {
    fileInputRef,
    fileName,
    imagePreviewUrl,
    mediaPreviewUrl,
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
