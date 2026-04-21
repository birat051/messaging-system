/**
 * Detects **likely** opaque ciphertext (base64-ish) so the UI does not use it as readable bubble text.
 * Heuristic only — not cryptographic validation.
 */
export function looksLikeOpaqueCiphertextBody(body: string): boolean {
  const t = body.trim();
  if (t.length < 12) {
    return false;
  }
  if (/\s/.test(t)) {
    return false;
  }
  return /^[A-Za-z0-9+/=_-]+$/.test(t);
}
