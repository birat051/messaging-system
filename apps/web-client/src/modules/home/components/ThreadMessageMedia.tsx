import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getMediaPublicDisplayFallbackUrl,
  isLikelyImageMediaKey,
  resolveMediaAttachmentDisplayUrl,
} from '@/common/utils/mediaPublicUrl';
import type { ThreadMessageMediaProps } from '../types/ThreadMessageMedia-types';

function attachmentAlt(isOwn: boolean): string {
  return isOwn
    ? 'Image attachment you sent'
    : 'Image attachment from the other person';
}

/**
 * External object storage (MinIO/S3) often works better without a cross-origin **`Referer`** (bucket policy).
 * **`blob:`** / **`data:`** stay default.
 */
function imgReferrerPolicy(src: string): 'no-referrer' | undefined {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    return undefined;
  }
  if (typeof window === 'undefined' || !src.startsWith('http')) {
    return undefined;
  }
  try {
    return new URL(src).origin !== window.location.origin
      ? 'no-referrer'
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Renders **`mediaKey`** as a **lazy-loaded** **`<img>`** when a URL is available (**`getMediaPublicObjectUrl`**
 * / **`MediaUploadResponse.url`** / blob preview) and the key looks like an image; optional **`<dialog>`** lightbox;
 * non-images become an **Open attachment** link. **No** AWS SDK in the browser.
 *
 * **Presigned URLs:** query strings include **`X-Amz-`**; we do **not** append cache-bust params on error (would
 * break the signature). For path-style public URLs (no `?`), one **cache-bust** retry can recover from stale CDN edge.
 */
export function ThreadMessageMedia({
  mediaKey,
  messageId,
  isOwn,
  previewUrlOverride = null,
  lightboxEnabled = true,
}: ThreadMessageMediaProps) {
  const url = resolveMediaAttachmentDisplayUrl(mediaKey, previewUrlOverride);
  const [displaySrc, setDisplaySrc] = useState(url);
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [retryDone, setRetryDone] = useState(false);
  const [altTried, setAltTried] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setDisplaySrc(url);
    setLoaded(false);
    setImgError(false);
    setRetryDone(false);
    setAltTried(false);
  }, [url]);

  useLayoutEffect(() => {
    if (!lightboxEnabled || !lightboxOpen) {
      return;
    }
    const d = dialogRef.current;
    if (!d) {
      return;
    }
    if (typeof d.showModal === 'function') {
      d.showModal();
    } else {
      d.setAttribute('open', '');
    }
  }, [lightboxOpen, lightboxEnabled]);

  if (!url) {
    return (
      <p className="min-w-0 text-sm break-words whitespace-pre-wrap">Attachment</p>
    );
  }

  function handleImageError() {
    const fallBack = url ? getMediaPublicDisplayFallbackUrl(mediaKey, url) : null;
    if (!retryDone && url && !url.includes('?')) {
      setRetryDone(true);
      setLoaded(false);
      setDisplaySrc(`${url}?_ekko_cb=${Date.now()}`);
      return;
    }
    if (!altTried && fallBack && displaySrc !== fallBack) {
      setAltTried(true);
      setLoaded(false);
      setImgError(false);
      setDisplaySrc(fallBack);
      return;
    }
    setImgError(true);
  }

  if (!isLikelyImageMediaKey(mediaKey)) {
    return (
      <p className="mt-1.5 min-w-0 text-sm break-words">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent break-all underline underline-offset-2"
        >
          Open attachment
        </a>
      </p>
    );
  }

  const alt = attachmentAlt(isOwn);
  const loadingId = `thread-msg-media-loading-${messageId}`;
  /** Fall back to **`url`** — **`displaySrc`** can become null after **`getMediaPublicDisplayFallbackUrl`**. */
  const imgSrc = displaySrc ?? url;

  const refPolicy = imgReferrerPolicy(imgSrc);

  if (imgError) {
    return (
      <p
        className="text-muted mt-1.5 min-w-0 text-sm break-words"
        role="status"
        id={`thread-msg-media-err-${messageId}`}
      >
        Could not load image.{' '}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent break-all underline underline-offset-2"
        >
          Open in new tab
        </a>
      </p>
    );
  }

  const thumbImgClassName = `absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
    loaded ? 'opacity-100' : 'opacity-0'
  }`;

  return (
    <>
      <div className="mt-1.5 min-w-0 w-full max-w-[min(100%,20rem)]">
        <div className="border-border bg-muted/30 relative aspect-video w-full overflow-hidden rounded-md border">
          {!loaded ? (
            <div
              id={loadingId}
              role="status"
              aria-live="polite"
              aria-busy="true"
              className="bg-muted absolute inset-0 animate-pulse"
            />
          ) : null}
          {lightboxEnabled ? (
            <button
              type="button"
              className="text-foreground focus:ring-accent/50 absolute inset-0 cursor-zoom-in outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background"
              onClick={() => {
                setLightboxOpen(true);
              }}
            >
              <img
                src={imgSrc}
                alt={alt}
                loading="lazy"
                decoding="async"
                referrerPolicy={refPolicy}
                aria-describedby={!loaded ? loadingId : undefined}
                onLoad={() => {
                  setLoaded(true);
                }}
                onError={handleImageError}
                className={`${thumbImgClassName} pointer-events-none`}
              />
            </button>
          ) : (
            <img
              src={imgSrc}
              alt={alt}
              loading="lazy"
              decoding="async"
              referrerPolicy={refPolicy}
              aria-describedby={!loaded ? loadingId : undefined}
              onLoad={() => {
                setLoaded(true);
              }}
              onError={handleImageError}
              className={thumbImgClassName}
            />
          )}
        </div>
      </div>

      {lightboxEnabled && lightboxOpen ? (
        <dialog
          ref={dialogRef}
          className="border-border bg-background text-foreground m-auto max-h-[min(90vh,100%)] max-w-[min(96vw,96rem)] w-full rounded-lg border p-0 shadow-xl backdrop:bg-black/60"
          aria-label="Image preview"
          onClose={() => {
            setLightboxOpen(false);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              dialogRef.current?.close();
            }
          }}
        >
          <div
            className="flex max-h-[min(90vh,100%)] flex-col gap-2 p-3 sm:p-4"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex shrink-0 justify-end">
              <button
                type="button"
                className="border-border text-foreground hover:bg-surface/80 focus:ring-accent/50 inline-flex min-h-11 touch-manipulation items-center rounded-md border px-3 text-sm outline-none focus:ring-2"
                onClick={() => {
                  dialogRef.current?.close();
                }}
              >
                Close
              </button>
            </div>
            <div className="bg-muted/20 relative min-h-0 min-w-0 flex-1 overflow-auto">
              <img
                src={imgSrc}
                alt={alt}
                loading="lazy"
                decoding="async"
                referrerPolicy={refPolicy}
                className="mx-auto max-h-[min(85vh,100%)] w-auto max-w-full object-contain"
              />
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
