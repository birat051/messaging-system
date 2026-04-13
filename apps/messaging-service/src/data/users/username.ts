/**
 * Normalized **`username`** stored on **`users`** (lowercase **`[a-z0-9_]`** — see **`registerUsernameSchema`**).
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
