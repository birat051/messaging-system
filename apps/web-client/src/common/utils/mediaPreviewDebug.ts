/**
 * **`console.log`** for **composer** `blob:` / upload URL previews and **`ThreadMessageMedia`** `src`.
 * **`vite dev`** only.
 */

let announcedMediaPreviewDebug = false;

export function isMediaPreviewDebugEnabled(): boolean {
  return Boolean(import.meta.env.DEV);
}

export function logMediaPreview(
  phase: string,
  details: Record<string, unknown>,
): void {
  if (!isMediaPreviewDebugEnabled()) {
    return;
  }
  if (!announcedMediaPreviewDebug) {
    announcedMediaPreviewDebug = true;
    console.log(
      '[media-preview] Debug ON (`vite dev`) — object URLs, upload URLs, `<img>` load/error, resolver branch.',
    );
  }
  console.log(`[media-preview] ${phase}`, details);
}

/** Prefer for **`blob:`** (opaque id); shorten **http(s)** for logs only. */
export function redactUrlForLog(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  const s = raw.trim();
  if (s.startsWith('blob:')) {
    return s.length <= 56 ? s : `blob:…${s.slice(-16)} (len=${s.length})`;
  }
  if (s.length <= 64) {
    return s;
  }
  return `${s.slice(0, 40)}…${s.slice(-12)} (len=${s.length})`;
}
