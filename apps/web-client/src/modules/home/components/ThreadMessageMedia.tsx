import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getMediaPublicDisplayFallbackUrl,
  isLikelyImageMediaKey,
  resolveMediaAttachmentDisplayUrl,
} from '@/common/utils/mediaPublicUrl';
import {
  logMediaPreview,
  redactUrlForLog,
} from '@/common/utils/mediaPreviewDebug';
import type { ThreadMessageMediaProps } from '../types/ThreadMessageMedia-types';

/** Standard thread attachment thumbnail (**150×150** px); lightbox is separate. */
const THUMB_SHELL = {
  outer: 'mt-1.5 min-w-0 h-[150px] w-[150px] shrink-0',
  inner:
    'border-border bg-muted/30 relative h-[150px] w-[150px] overflow-hidden rounded-md border',
} as const;

function attachmentAlt(isOwn: boolean): string {
  return isOwn
    ? 'Image attachment you sent'
    : 'Image attachment from the other person';
}

/**
 * Renders **`mediaKey`** as a **lazy-loaded** **`<img>`** when a URL is available (**`getMediaPublicObjectUrl`**
 * / **`MediaUploadResponse.url`** / blob preview) and the key looks like an image; optional **`<dialog>`** lightbox;
 * non-images become an **Open attachment** link. **No** AWS SDK in the browser.
 *
 * **Referrer:** Thumbnails omit an explicit **`referrerPolicy`** (browser default). Forcing **`no-referrer`** on
 * cross-origin MinIO/S3 can break anonymous **`GET`** when the object server expects a sane **`Referer`** (your curl
 * with **`Referer: http://localhost:5173/`** may succeed while the previous **`no-referrer`** img did not).
 *
 * **Presigned URLs:** query strings include **`X-Amz-`**; we do **not** append cache-bust params on error (would
 * break the signature). For path-style public URLs (no `?`), one **cache-bust** retry can recover from stale CDN edge.
 *
 * **Inline thumbnails:** fixed **150×150** px frame; lightbox unchanged.
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
  const thumbImgRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  /** Resolved **`img src`** (preview URL, cache bust, **`displaySrc`). */
  const imgSrc = displaySrc ?? url;

  /** Sync **`displaySrc`** / error-retry flags when **`url`** identity changes (`resolveMediaAttachmentDisplayUrl`). */
  useEffect(() => {
    setDisplaySrc(url);
    setImgError(false);
    setRetryDone(false);
    setAltTried(false);
    logMediaPreview('thread-thumb: resolver output', {
      messageId,
      isOwn,
      mediaKeySnippet:
        mediaKey.trim().length <= 52
          ? mediaKey.trim()
          : `${mediaKey.trim().slice(0, 24)}…${mediaKey.trim().slice(-18)}`,
      previewUrlOverrideHint: previewUrlOverride
        ? redactUrlForLog(previewUrlOverride)
        : null,
      resolvedDisplayUrl: redactUrlForLog(url),
    });
  }, [url, messageId, isOwn, mediaKey, previewUrlOverride]);

  /** When **`src`** settles, **`onLoad`** may not fire for **memory-cache hits** — the image stays **`opacity:0`**. Recover via **`complete`** / **`naturalWidth`** within a few animation frames (**`onLoad`** still fires for slower loads). */
  useEffect(() => {
    setLoaded(false);
    let cancelled = false;
    let rafId = 0;
    let tries = 0;
    function tick() {
      if (cancelled || tries >= 8) {
        return;
      }
      tries += 1;
      const el = thumbImgRef.current;
      if (el?.complete && el.naturalWidth > 0) {
        setLoaded(true);
        return;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [imgSrc]);

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
    logMediaPreview('thread-thumb: <img> error', {
      messageId,
      attemptedSrc: redactUrlForLog(imgSrc),
    });
    const fallBack = url ? getMediaPublicDisplayFallbackUrl(mediaKey, url) : null;
    if (
      !retryDone &&
      url &&
      !url.includes('?') &&
      !url.startsWith('blob:') &&
      !url.startsWith('data:')
    ) {
      logMediaPreview('thread-thumb: retry with cache-bust query', {
        messageId,
        base: redactUrlForLog(url),
      });
      setRetryDone(true);
      setLoaded(false);
      setDisplaySrc(`${url}?_ekko_cb=${Date.now()}`);
      return;
    }
    if (!altTried && fallBack && displaySrc !== fallBack) {
      logMediaPreview('thread-thumb: fallback URL from env key prefix', {
        messageId,
        fallback: redactUrlForLog(fallBack),
      });
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
      <div className={THUMB_SHELL.outer}>
        <div className={THUMB_SHELL.inner}>
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
                ref={thumbImgRef}
                src={imgSrc}
                alt={alt}
                loading="lazy"
                decoding="async"
                aria-describedby={!loaded ? loadingId : undefined}
                onLoad={(e) => {
                  setLoaded(true);
                  logMediaPreview('thread-thumb: thumbnail <img> load', {
                    messageId,
                    src: redactUrlForLog(e.currentTarget.currentSrc),
                    naturalWidth: e.currentTarget.naturalWidth,
                    naturalHeight: e.currentTarget.naturalHeight,
                  });
                }}
                onError={handleImageError}
                className={`${thumbImgClassName} pointer-events-none`}
              />
            </button>
          ) : (
            <img
              ref={thumbImgRef}
              src={imgSrc}
              alt={alt}
              loading="lazy"
              decoding="async"
              aria-describedby={!loaded ? loadingId : undefined}
              onLoad={(e) => {
                setLoaded(true);
                logMediaPreview('thread-thumb: thumbnail <img> load', {
                  messageId,
                  src: redactUrlForLog(e.currentTarget.currentSrc),
                  naturalWidth: e.currentTarget.naturalWidth,
                  naturalHeight: e.currentTarget.naturalHeight,
                });
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
                className="mx-auto max-h-[min(85vh,100%)] w-auto max-w-full object-contain"
              />
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
