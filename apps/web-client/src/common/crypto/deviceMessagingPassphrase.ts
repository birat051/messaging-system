/**
 * **Automatic** local key wrapping for E2EE bring-up: a per-user, per-browser secret stored in
 * **`localStorage`** (not a user-chosen passphrase). Stronger options (OS keystore, user passphrase)
 * can replace this without changing the wire format.
 */

const STORAGE_PREFIX = 'messaging-e2ee-wrap-v1:';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId.trim()}`;
}

/**
 * Returns a stable random passphrase for wrapping the user’s private key in **`IndexedDB`**.
 */
export function getOrCreateDeviceScopedPassphrase(userId: string): string {
  const key = storageKey(userId);
  try {
    const existing = globalThis.localStorage?.getItem(key);
    if (existing && existing.trim().length > 0) {
      return existing;
    }
  } catch {
    // private mode / disabled storage — fall through to ephemeral (session-only) secret
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  try {
    globalThis.localStorage?.setItem(key, hex);
  } catch {
    // If storage fails, still return a secret for this runtime (won’t survive reload).
  }
  return hex;
}
