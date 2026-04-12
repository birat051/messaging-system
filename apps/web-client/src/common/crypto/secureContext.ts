/**
 * **`SubtleCrypto`** and meaningful key material handling require a **secure context**
 * (`https:` or `http://localhost` / `http://127.0.0.1`). See **`docs/USER_KEYPAIR_AND_E2EE_DESIGN.md`**
 * (client private key storage) and MDN **`window.isSecureContext`**.
 */

export function isSecureContext(): boolean {
  if (typeof globalThis === 'undefined') {
    return false;
  }
  if (typeof globalThis.isSecureContext === 'boolean') {
    return globalThis.isSecureContext;
  }
  return true;
}

/**
 * Throws if the page is not running in a **secure context** (e.g. plain **`http://`** on a LAN hostname).
 * Safe to call during SSR / Vitest (no `window`) — treats as secure so tests can run with polyfills.
 */
export function assertSecureContextForPrivateKeyOps(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!window.isSecureContext) {
    throw new Error(
      'Private key storage requires a secure context (HTTPS or http://localhost). Open the app over HTTPS.',
    );
  }
}
