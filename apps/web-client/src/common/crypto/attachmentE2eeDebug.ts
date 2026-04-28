/**
 * Gated **`console.log`** for hybrid **attachment** send/receive (inner v1 JSON **`m.k`**, decrypt, display).
 * **Development (`vite dev`) only** — traces are **on** unless you build for production (`vite build`).
 *
 * Does **not** log raw **`encryptedMessageKeys`** values or AES message keys — object **storage key** may be
 * logged when present (same as in MinIO paths) to debug URL/display issues.
 */

let announcedAttachmentE2eeDebug = false;

export function isAttachmentE2eeDebugEnabled(): boolean {
  return Boolean(import.meta.env.DEV);
}

export function logAttachmentE2ee(
  phase: string,
  details: Record<string, unknown>,
): void {
  if (!isAttachmentE2eeDebugEnabled()) {
    return;
  }
  if (!announcedAttachmentE2eeDebug) {
    announcedAttachmentE2eeDebug = true;
    console.log(
      '[attachment-e2ee] Debug logging is ON (`vite dev`). If you see no lines below, open the conversation thread (decrypt runs per thread).',
    );
  }
  console.log(`[attachment-e2ee] ${phase}`, details);
}

/** Redact long strings for logs (keep head + tail). */
export function redactMiddle(s: string, head = 24, tail = 8): string {
  const t = s.trim();
  if (t.length <= head + tail + 3) {
    return t;
  }
  return `${t.slice(0, head)}…${t.slice(-tail)} (len=${t.length})`;
}
