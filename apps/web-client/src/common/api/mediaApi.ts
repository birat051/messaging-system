import type { AxiosProgressEvent } from 'axios';
import type { MediaUploadResponse, UploadMediaOptions } from '../types/mediaApi-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

export type { MediaUploadResponse, UploadMediaOptions } from '../types/mediaApi-types';

/**
 * **`POST /v1/media/upload`** — body built with **`buildMediaUploadFormData`** (**`MEDIA_UPLOAD_FORM_FIELD`** = **`file`**) per OpenAPI.
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
