/**
 * Escapes a user-supplied string for safe use as a **literal** inside a **`RegExp`**
 * (prevents ReDoS / unintended metacharacters from **`GET /users/search`** queries).
 */
export function escapeRegexLiteral(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
