import { useState } from 'react';
import {
  getMediaPublicObjectUrl,
  isLikelyImageMediaKey,
} from '@/common/utils/mediaPublicUrl';
import type { ThreadMessageMediaProps } from '../types/ThreadMessageMedia-types';

function attachmentAlt(isOwn: boolean): string {
  return isOwn
    ? 'Image attachment you sent'
    : 'Image attachment from the other person';
}

/**
 * Renders **`mediaKey`** as a **lazy-loaded** image when a public URL is configured and the key looks like an image;
 * otherwise a generic file link or a text fallback when URLs are not available.
 */
export function ThreadMessageMedia({
  mediaKey,
  messageId,
  isOwn,
}: ThreadMessageMediaProps) {
  const url = getMediaPublicObjectUrl(mediaKey);
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!url) {
    return (
      <p className="min-w-0 text-sm break-words whitespace-pre-wrap">Attachment</p>
    );
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

  return (
    <div className="mt-1.5 min-w-0 w-full max-w-[min(100%,20rem)]">
      <div
        className="border-border bg-muted/30 relative aspect-video w-full overflow-hidden rounded-md border"
        aria-label={alt}
      >
        {!loaded ? (
          <div
            id={loadingId}
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="bg-muted absolute inset-0 animate-pulse"
          />
        ) : null}
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          aria-describedby={!loaded ? loadingId : undefined}
          onLoad={() => {
            setLoaded(true);
          }}
          onError={() => {
            setImgError(true);
          }}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
    </div>
  );
}
