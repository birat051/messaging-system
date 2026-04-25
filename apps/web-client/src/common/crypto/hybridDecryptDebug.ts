/**
 * Gated **`console.debug`** for hybrid decrypt — enable with **`VITE_DEBUG_HYBRID_DECRYPT=true`** (dev).
 * Never logs raw keys or ciphertext; uses short SHA-256 prefixes for correlation only.
 */

export type HybridDecryptDebugMeta = {
  messageId?: string;
  conversationId?: string;
};

/** True when detailed hybrid decrypt traces should print (development + env flag). */
export function isHybridDecryptDebugEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    import.meta.env.VITE_DEBUG_HYBRID_DECRYPT === 'true'
  );
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
  console.debug(`[hybrid-decrypt] ${phase}`, details);
}
