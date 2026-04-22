/**
 * **Attachment data path (ids + display URLs):**
 *
 * 1. **`POST /v1/media/upload`** — **`MediaUploadResponse`** is **`{ key, bucket, url? }`**. **`key`** is the stable id
 *    (S3 object key under **`users/{userId}/…`**). **`url`** is optional; when **`S3_PUBLIC_BASE_URL`** is set on the
 *    API, it matches **`publicObjectUrl(env, key)`** in **`messaging-service`** **`userMediaUpload.ts`**.
 * 2. **`message:send` / `SendMessageRequest`** — **Hybrid E2EE:** **`mediaKey`** is **null** on the wire; the object key
 *    lives only inside opaque **`body`** (inner **v1** JSON **`m.k`** — **`messageHybridPlaintext.ts`**). **Legacy plaintext**
 *    sends may still set **`mediaKey`**; the service persists **`MessageDocument.mediaKey`** when not hybrid.
 *    Not **`attachments[]`** / **`mediaId`**.
 * 3. **Recipient** — **`parseMessageNewPayload`** / **`fetch`** keep **`mediaKey`** when the server stored it; hybrid rows
 *    use client-decrypted **`m.k`** for display (**`decryptedAttachmentKeyByMessageId`**).
 * 4. **Display** — **`resolveMediaAttachmentDisplayUrl(mediaKey, mediaPreviewUrl)`** prefers client **`blob:`** /
 *    decrypted hybrid **`m.u`** / upload **`url`**; otherwise **`getMediaPublicObjectUrl(mediaKey)`** or
 *    **`m.b` + `m.k`** via **`buildMediaUrlFromPublicBasePrefixAndKey`**.
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
  const prefix = getMediaPublicBasePrefix();
  if (!prefix) {
    return null;
  }
  const path = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `${prefix}/${path}`;
}

/**
 * **`VITE_S3_PUBLIC_BASE_URL` / `VITE_S3_BUCKET`** — same prefix used by **`getMediaPublicObjectUrl`**, exposed for
 * hybrid inner **`m.b`** when a full URL is not known at send time.
 */
export function getMediaPublicBasePrefix(): string | null {
  const rawBase = import.meta.env.VITE_S3_PUBLIC_BASE_URL;
  const rawBucket = import.meta.env.VITE_S3_BUCKET;
  const base = typeof rawBase === 'string' ? rawBase.replace(/\/$/, '').trim() : '';
  const bucket = typeof rawBucket === 'string' ? rawBucket.trim() : '';
  if (!base || !bucket) {
    return null;
  }
  return `${base}/${encodeURIComponent(bucket)}`;
}

/**
 * Builds an object URL from an encrypted **`m.b`** prefix + **`m.k`** (same encoding as **`getMediaPublicObjectUrl`**).
 */
export function buildMediaUrlFromPublicBasePrefixAndKey(
  basePrefix: string,
  mediaKey: string,
): string | null {
  const p = basePrefix.replace(/\/$/, '').trim();
  const key = mediaKey.trim();
  if (!p || !key) {
    return null;
  }
  const path = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `${p}/${path}`;
}

const IMAGE_KEY_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

/**
 * When the **primary** display URL fails to load (stale CDN, edge glitch, or a time-limited URL), try the
 * path-style URL from **`VITE_S3_*`** if it differs. **Public R2 / public buckets** use stable URLs here; **no**
 * client re-presign — expired pre-signed URLs with query strings skip cache-bust in **`ThreadMessageMedia`** and
 * may recover via this path when the object is also publicly readable under the configured base.
 */
export function getMediaPublicDisplayFallbackUrl(
  mediaKey: string,
  primaryDisplayUrl: string | null,
): string | null {
  const fromKey = getMediaPublicObjectUrl(mediaKey);
  if (!fromKey) {
    return null;
  }
  const raw = primaryDisplayUrl?.trim() ?? '';
  if (!raw) {
    return null;
  }
  return fromKey !== raw ? fromKey : null;
}

/** Heuristic when MIME is unavailable on **`Message`** — treat other keys as generic downloads. */
export function isLikelyImageMediaKey(mediaKey: string): boolean {
  return IMAGE_KEY_PATTERN.test(mediaKey.trim());
}
