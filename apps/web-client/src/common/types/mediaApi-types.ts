import type { components } from '../../generated/api-types';

type S = components['schemas'];

export type MediaUploadResponse = S['MediaUploadResponse'];
export type MediaPresignResponse = S['MediaPresignResponse'];
export type MediaPresignRequestBody = S['MediaPresignRequest'];

export type UploadMediaOptions = {
  /** 0–100 while upload is in progress. */
  onUploadProgress?: (percentLoaded: number) => void;
  signal?: AbortSignal;
  /**
   * Byte length of the request body (e.g. **`File.size`**) — used when the XHR **`total`** is **0**
   * so **`onUploadProgress`** can still report percent (some browsers omit **`total`** for **`FormData`**).
   */
  contentLength?: number;
};
