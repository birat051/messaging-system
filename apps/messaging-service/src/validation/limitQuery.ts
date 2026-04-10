import { z } from 'zod';

/**
 * Aligns with OpenAPI **`LimitQuery`**: optional query param; **default `20`** when omitted;
 * **maximum `100`** (`docs/openapi/openapi.yaml`).
 *
 * Use for **`GET /users/search`**, **`GET /conversations`**, **`GET /conversations/{id}/messages`**, and any
 * other paginated list that shares **`limit`**.
 */
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

/** Zod field for **`limit`** — coerce from query string; omit → handled by **`resolveListLimit`**. */
export const limitQuerySchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_LIST_LIMIT)
  .optional();

/**
 * Effective page size after **`LimitQuery`** — **`20`** when **`limit`** is omitted or invalid.
 */
export function resolveListLimit(
  limit: number | undefined | null,
): number {
  if (limit === undefined || limit === null || Number.isNaN(limit)) {
    return DEFAULT_LIST_LIMIT;
  }
  const n = Math.trunc(Number(limit));
  if (n < 1) {
    return 1;
  }
  if (n > MAX_LIST_LIMIT) {
    return MAX_LIST_LIMIT;
  }
  return n;
}
