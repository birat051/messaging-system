/** DEV-only session write traces — fingerprints only, never JWT strings. */

let lastAccessTokenFingerprint: string | null = null;

export function accessTokenFingerprint(accessToken: string | null | undefined): string | null {
  if (!accessToken?.trim()) return null;
  let h = 2166136261;
  for (let i = 0; i < accessToken.length; i++) {
    h ^= accessToken.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function logDevSessionTokenWrite(source: string, accessToken: string | null | undefined): void {
  if (!import.meta.env.DEV) return;
  const fp = accessTokenFingerprint(accessToken);
  const duplicateOfPreviousWrite = fp !== null && fp === lastAccessTokenFingerprint;
  console.debug('[DEBUG]: auth session write', {
    source,
    accessTokenFingerprint: fp,
    duplicateOfPreviousWrite,
  });
  lastAccessTokenFingerprint = fp;
}
