/**
 * Browser-side mirror of **`publicObjectUrl`** in **`messaging-service`** **`userMediaUpload.ts`**.
 * Uses **`VITE_S3_PUBLIC_BASE_URL`** and **`VITE_S3_BUCKET`** — same values as the API’s **`S3_PUBLIC_BASE_URL`** / **`S3_BUCKET`**
 * so **`Message.mediaKey`** resolves to the same public object URL as **`MediaUploadResponse.url`** when the server exposes one.
 */
export function getMediaPublicObjectUrl(mediaKey: string): string | null {
  const key = mediaKey.trim();
  if (!key) {
    return null;
  }
  const rawBase = import.meta.env.VITE_S3_PUBLIC_BASE_URL;
  const rawBucket = import.meta.env.VITE_S3_BUCKET;
  const base = typeof rawBase === 'string' ? rawBase.replace(/\/$/, '').trim() : '';
  const bucket = typeof rawBucket === 'string' ? rawBucket.trim() : '';
  if (!base || !bucket) {
    return null;
  }
  const path = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `${base}/${encodeURIComponent(bucket)}/${path}`;
}

const IMAGE_KEY_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

/** Heuristic when MIME is unavailable on **`Message`** — treat other keys as generic downloads. */
export function isLikelyImageMediaKey(mediaKey: string): boolean {
  return IMAGE_KEY_PATTERN.test(mediaKey.trim());
}
