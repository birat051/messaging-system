/**
 * Gated **`console.log`** for hybrid decrypt — **`vite dev`** only (off in production bundles).
 * Never logs raw keys or ciphertext; uses short SHA-256 prefixes for correlation only.
 */

export type HybridDecryptDebugMeta = {
  messageId?: string;
  conversationId?: string;
};

/** True while running the development server (`vite dev`). */
export function isHybridDecryptDebugEnabled(): boolean {
  return Boolean(import.meta.env.DEV);
}

/** First 8 hex chars of SHA-256(raw) — not reversible to **`raw`**. */
export async function fingerprintRawKeyMaterial(raw: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return '(no subtle)';
  }
  const digest = await subtle.digest('SHA-256', raw as BufferSource);
  const bytes = new Uint8Array(digest).slice(0, 4);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function logHybridDecrypt(
  phase: string,
  details: Record<string, unknown>,
): void {
  if (!isHybridDecryptDebugEnabled()) {
    return;
  }
  console.log(`[hybrid-decrypt] ${phase}`, details);
}
