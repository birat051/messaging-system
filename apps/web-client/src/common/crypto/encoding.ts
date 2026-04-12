/**
 * Browser-safe Base64 helpers for crypto payloads (no Node **`Buffer`** in app bundles).
 */

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const trimmed = b64.trim();
  const binary = atob(trimmed);
  const out = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(out);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return out;
}
