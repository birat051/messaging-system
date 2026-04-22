/**
 * Browser **`PUT`** to an S3/R2 pre-signed URL with **`upload`** progress and **`AbortSignal`** cancel.
 * No AWS SDK — **`fetch`** is insufficient for upload progress in all browsers; **XHR** is used.
 */

export type PutPresignedBlobOptions = {
  /** Headers required by the signature (e.g. **`Content-Type`**, **`Content-Length`**). */
  headers: Record<string, string>;
  signal?: AbortSignal;
  /** 0–100 while uploading. */
  onProgress?: (percentLoaded: number) => void;
};

/**
 * Uploads **`body`** to **`url`** with **`PUT`**. Rejects with **`DOMException`** **`AbortError`** when **`signal`** aborts.
 */
export function putBlobToPresignedUrl(
  url: string,
  body: Blob,
  options: PutPresignedBlobOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);

    for (const [key, value] of Object.entries(options.headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0 && options.onProgress) {
        options.onProgress(
          Math.min(100, Math.round((ev.loaded / ev.total) * 100)),
        );
      }
    };

    const signal = options.signal;
    const onAbort = () => {
      xhr.abort();
    };

    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    xhr.onload = (): void => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(
        new Error(
          xhr.responseText?.trim()
            ? `Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`
            : `Upload failed (${xhr.status})`,
        ),
      );
    };

    xhr.onerror = (): void => {
      cleanup();
      reject(new Error('Network error during upload'));
    };

    xhr.onabort = (): void => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    xhr.send(body);
  });
}
