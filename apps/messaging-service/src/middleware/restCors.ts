import cors from 'cors';
import type { Env } from '../config/env.js';

/**
 * Resolves **`REST_CORS_ALLOWED_ORIGINS`** → **`cors`** `origin` option: **`*`** (wildcard), one URL string,
 * or **`string[]`** for comma-separated origins (no whitespace in parts after trim).
 */
export function resolveRestCorsOrigin(raw: string): cors.CorsOptions['origin'] {
  const t = raw.trim();
  if (t === '*') {
    return '*';
  }
  const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return '*';
  }
  if (parts.length === 1) {
    return parts[0] as string;
  }
  return parts;
}

export function createRestCorsMiddleware(env: Env) {
  return cors({
    origin: resolveRestCorsOrigin(env.REST_CORS_ALLOWED_ORIGINS),
  });
}
