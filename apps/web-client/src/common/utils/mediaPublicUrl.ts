/**
 * **Attachment data path (ids + display URLs):**
 *
 * 1. **`POST /v1/media/upload`** — **`MediaUploadResponse`** is **`{ key, bucket, url? }`**. **`key`** is the stable id
 *    (S3 object key under **`users/{userId}/…`**). **`url`** is optional; when **`S3_PUBLIC_BASE_URL`** is set on the
 *    API, it matches **`publicObjectUrl(env, key)`** in **`messaging-service`** **`userMediaUpload.ts`**.
 * 2. **`message:send` / `SendMessageRequest`** — clients send **`mediaKey`** (that same **`key`** string), not nested
 *    **`attachments`** or a separate **`mediaId`**. The service persists **`MessageDocument.mediaKey`** and emits the
 *    same value on Socket.IO **`message:new`** and **`GET /conversations/{id}/messages`** (**`messageDocumentToApi`**).
 * 3. **Recipient** — **`parseMessageNewPayload`** / **`hydrateMessagesFromFetch`** keep **`mediaKey`** on each **`Message`**.
 * 4. **Display** — **`resolveMediaAttachmentDisplayUrl(mediaKey, mediaPreviewUrl)`** prefers client **`blob:`** / upload
 *    **`url`** (sender optimistic + merged ack); otherwise **`getMediaPublicObjectUrl(mediaKey)`** using
 *    **`VITE_S3_PUBLIC_BASE_URL`** + **`VITE_S3_BUCKET`** aligned with the API (**no** AWS SDK in the browser).
 */
export function resolveMediaAttachmentDisplayUrl(
  mediaKey: string,
  previewUrlOverride?: string | null,
): string | null {
  const raw = previewUrlOverride?.trim();
  if (raw) {
    if (
      raw.startsWith('blob:') ||
      raw.startsWith('https:') ||
      raw.startsWith('http:')
    ) {
      return raw;
    }
  }
  return getMediaPublicObjectUrl(mediaKey);
}

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
