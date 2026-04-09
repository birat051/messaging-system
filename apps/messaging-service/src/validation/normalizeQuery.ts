import type { ParsedQs } from 'qs';

/**
 * Express `req.query` values may be `string | string[]`; collapse to a single string per key for Zod.
 */
export function normalizeQueryForZod(query: ParsedQs): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      out[key] = value[0];
    } else {
      out[key] = value;
    }
  }
  return out;
}
