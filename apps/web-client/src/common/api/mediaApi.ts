import type { AxiosProgressEvent } from 'axios';
import type {
  MediaPresignRequestBody,
  MediaPresignResponse,
  MediaUploadResponse,
  UploadMediaOptions,
} from '../types/mediaApi-types';
import { putBlobToPresignedUrl } from '../utils/presignedObjectUpload';
import {
  resolveMediaMimeForUpload,
  isAllowedMediaMimeType,
} from '../utils/mediaAllowedMime';
import { getMediaUploadMaxBytes } from '@/common/utils/apiConfig';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

export type {
  MediaUploadResponse,
  MediaPresignResponse,
  UploadMediaOptions,
} from '../types/mediaApi-types';

/**
 * **`POST /v1/media/upload`** — multipart to messaging-service (**not** the chat composer path; composer uses **`uploadMediaViaPresignedPut`**).
 * Body: **`buildMediaUploadFormData`** (**`MEDIA_UPLOAD_FORM_FIELD`** = **`file`**) per OpenAPI.
 * Strips the default JSON **`Content-Type`** on the shared **`httpClient`** so the runtime sets
 * **`multipart/form-data`** with a correct boundary.
 */
export async function uploadMedia(
  formData: FormData,
  options?: UploadMediaOptions,
): Promise<MediaUploadResponse> {
  /** MSW intercepts **`fetch`**; **`XMLHttpRequest` + `FormData`** can hang under MSW in Vitest — use fetch adapter in **`MODE === 'test'`**. */
  const testFetchAdapter =
    import.meta.env.MODE === 'test' ? ('fetch' as const) : undefined;

  const res = await httpClient.post<MediaUploadResponse>(
    API_PATHS.media.upload,
    formData,
    {
      ...(testFetchAdapter ? { adapter: testFetchAdapter } : {}),
      signal: options?.signal,
      onUploadProgress:
        options?.onUploadProgress === undefined
          ? undefined
          : (e: AxiosProgressEvent) => {
              const cb = options.onUploadProgress;
              if (!cb) {
                return;
              }
              const xhrTotal = e.total ?? 0;
              const fallback = options.contentLength ?? 0;
              const total = xhrTotal > 0 ? xhrTotal : fallback;
              if (total > 0) {
                const pct = Math.min(100, Math.round((e.loaded / total) * 100));
                cb(pct);
              }
            },
      transformRequest: [
        (data, headers) => {
          if (data instanceof FormData) {
            headers.delete('Content-Type');
          }
          return data;
        },
      ],
    },
  );
  return res.data;
}

/**
 * **`POST /v1/media/presign`** — JSON body; requires auth (Bearer on **`httpClient`**).
 */
export async function postMediaPresign(
  body: MediaPresignRequestBody,
  options?: { signal?: AbortSignal },
): Promise<MediaPresignResponse> {
  const res = await httpClient.post<MediaPresignResponse>(
    API_PATHS.media.presign,
    body,
    { signal: options?.signal },
  );
  return res.data;
}

const UNSUPPORTED_MIME_MESSAGE =
  'Unsupported file type. Use a supported image or video (JPEG, PNG, WebP, GIF, MP4, WebM, MOV, OGV).';

/**
 * **`POST /v1/media/presign`** → **`PUT`** pre-signed URL (R2 / S3-compatible).\
 * Returns the same **`MediaUploadResponse`** shape as **`uploadMedia`** (**`url`** is usually **`null`** unless you add a public URL policy).
 */
export async function uploadMediaViaPresignedPut(
  file: File,
  options?: UploadMediaOptions,
): Promise<MediaUploadResponse> {
  const mime = resolveMediaMimeForUpload(file);
  if (!mime || !isAllowedMediaMimeType(mime)) {
    throw new Error(UNSUPPORTED_MIME_MESSAGE);
  }
  const contentLength = file.size;
  if (contentLength <= 0) {
    throw new Error('File is empty.');
  }
  const maxBytes = getMediaUploadMaxBytes();
  if (contentLength > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`File is too large. Maximum size is ${mb} MB.`);
  }

  const presign = await postMediaPresign(
    {
      contentType: mime,
      contentLength,
      filename: file.name?.trim() || undefined,
    },
    { signal: options?.signal },
  );

  const testMode = import.meta.env.MODE === 'test';
  await putBlobToPresignedUrl(presign.url, file, {
    headers: presign.headers,
    signal: options?.signal,
    ...(!testMode && options?.onUploadProgress
      ? { onProgress: options.onUploadProgress }
      : {}),
  });

  return {
    key: presign.key,
    bucket: presign.bucket,
    url: null,
  };
}
