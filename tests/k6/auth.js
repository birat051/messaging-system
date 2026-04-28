/**
 * REST auth — `POST /v1/auth/login`, `POST /v1/auth/refresh` — matches messaging-service
 * (refresh rotates token; store new refresh after each `postRefresh` — same as web client).
 * @file
 */
import http from 'k6/http';
import encoding from 'k6/encoding';
import { k6HttpTags } from './tags.js';
import {
  http5xx,
  httpAuthLoginMs,
  httpAuthRefreshMs,
  httpAuthLoginFailures,
  httpAuthRefreshFailures,
} from './metrics.js';

const JSON_HDR = { 'Content-Type': 'application/json' };

/**
 * @param {string} accessToken
 * @returns {{ sub?: string, exp?: number, [k: string]: unknown } | null}
 */
export function readJwtPayload(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    return null;
  }
  const parts = accessToken.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const json = encoding.b64decode(parts[1], 'rawurl', 's');
    return /** @type {{ sub?: string, exp?: number }} */ (JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * @param {string} accessToken
 * @returns {string}
 */
function readJwtSub(accessToken) {
  const p = readJwtPayload(accessToken);
  return p && p.sub && typeof p.sub === 'string' ? p.sub : '';
}

/**
 * `exp` is Unix seconds. If missing, treat as **always fresh** (k6 will use refresh on 401 only if we add that later).
 * @param {string} accessToken
 * @param {number} bufferSec  refresh when `exp - bufferSec` is before `now` (e.g. 60–300 for soak)
 * @returns {boolean}
 */
export function isAccessTokenFresh(accessToken, bufferSec) {
  const p = readJwtPayload(accessToken);
  if (!p) {
    return false;
  }
  if (p.exp == null || typeof p.exp !== 'number') {
    return true;
  }
  const now = Date.now() / 1000;
  return p.exp - bufferSec > now;
}

/**
 * Stable per-user key for per-VU auth cache.
 * @param {UserRow} row
 * @returns {string}
 */
export function sessionKeyForRow(row) {
  if (row.email && String(row.email).length > 0) {
    return 'e:' + String(row.email);
  }
  if (row.userId && String(row.userId).length > 0) {
    return 'u:' + String(row.userId);
  }
  return 'anon';
}

/**
 * @typedef {Object} UserRow
 * @property {string} [email]
 * @property {string} [password]
 * @property {string} [userId]  static hint (optional; else JWT `sub`)
 * @property {string} [accessToken]  pre-minted (optional, with `refreshToken`)
 * @property {string} [refreshToken]
 */

/**
 * @typedef {Object} AuthEntry
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {string} userId
 */

/**
 * @param {string} baseUrl
 * @param {string} email
 * @param {string} password
 * @returns {{ status: number, accessToken: string | null, refreshToken: string | null, body: string }}
 */
export function postLogin(baseUrl, email, password) {
  const url = `${baseUrl}/auth/login`;
  const res = http.post(url, JSON.stringify({ email, password }), {
    headers: JSON_HDR,
    tags: { name: 'AuthLogin' },
  });
  if (res.status >= 500) {
    return {
      status: res.status,
      accessToken: null,
      refreshToken: null,
      body: String(res.body),
    };
  }
  let data = null;
  try {
    data = res.json();
  } catch {
    // not JSON
  }
  const accessToken =
    data && typeof data === 'object' && data !== null && 'accessToken' in data
      ? String(/** @type {{ accessToken?: string }} */ (data).accessToken || '')
      : null;
  const refreshToken =
    data && typeof data === 'object' && data !== null && 'refreshToken' in data
      ? String(/** @type {{ refreshToken?: string }} */ (data).refreshToken || '')
      : null;
  if (!accessToken) {
    return { status: res.status, accessToken: null, refreshToken: null, body: String(res.body) };
  }
  return { status: res.status, accessToken, refreshToken, body: String(res.body) };
}

/**
 * @param {string} baseUrl
 * @param {string} refreshToken
 * @returns {{ status: number, accessToken: string | null, refreshToken: string | null, body: string }}
 */
export function postRefresh(baseUrl, refreshToken) {
  const t0 = Date.now();
  const res = http.post(
    `${baseUrl}/auth/refresh`,
    JSON.stringify({ refreshToken }),
    { headers: JSON_HDR, tags: k6HttpTags({ name: 'AuthRefresh' }) },
  );
  httpAuthRefreshMs.add(Date.now() - t0);
  if (res.status >= 500) {
    http5xx.add(1);
  } else {
    http5xx.add(0);
  }
  let data = null;
  try {
    data = res.json();
  } catch {
    // not JSON
  }
  const accessToken =
    data && typeof data === 'object' && data !== null && 'accessToken' in data
      ? String(/** @type {{ accessToken?: string }} */ (data).accessToken || '')
      : null;
  const newRefresh =
    data && typeof data === 'object' && data !== null && 'refreshToken' in data
      ? String(/** @type {{ refreshToken?: string }} */ (data).refreshToken || '')
      : null;
  return { status: res.status, accessToken, refreshToken: newRefresh, body: String(res.body) };
}

/**
 * Pre-generated login per run, optional **soak** behavior: `POST /v1/auth/refresh` when access JWT
 * is within `bufferSec` of `exp` (or expired), then next Socket.IO run uses the new pair — same as
 * app **disconnect + reconnect** with a fresh handshake `auth.token`.
 *
 * @param {string} baseUrl
 * @param {import('./config.js').K6Config} cfg
 * @param {UserRow} row
 * @param {Record<string, AuthEntry | undefined>} cache  mutable per-VU store (e.g. one object in `iteration.js`)
 * @returns {AuthEntry | null}
 */
export function resolveUserAuth(baseUrl, cfg, row, cache) {
  const key = sessionKeyForRow(row);
  const bufferSec = cfg.jwtExpiryBufferSec;
  /** @type {AuthEntry | null} */
  let ent = cache[key] || null;

  if (row.accessToken && row.refreshToken) {
    if (!ent) {
      const userId = row.userId && String(row.userId).length
        ? String(row.userId)
        : readJwtSub(row.accessToken);
      ent = {
        accessToken: String(row.accessToken),
        refreshToken: String(row.refreshToken),
        userId: userId || readJwtSub(row.accessToken),
      };
    }
  }

  if (ent && isAccessTokenFresh(ent.accessToken, bufferSec)) {
    if (!ent.userId) {
      ent.userId = readJwtSub(ent.accessToken);
    }
    if (!ent.userId) {
      return null;
    }
    cache[key] = ent;
    return { ...ent };
  }

  if (ent && ent.refreshToken) {
    const r = postRefresh(baseUrl, ent.refreshToken);
    if (r.status === 200 && r.accessToken && r.refreshToken) {
      const userId =
        ent.userId && ent.userId.length
          ? ent.userId
          : readJwtSub(r.accessToken);
      ent = {
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        userId,
      };
      cache[key] = ent;
      return { ...ent };
    }
    httpAuthRefreshFailures.add(1);
  }

  if (row.email && row.password) {
    const t0 = Date.now();
    const r = postLogin(baseUrl, row.email, row.password);
    httpAuthLoginMs.add(Date.now() - t0);
    if (r.status >= 500) {
      http5xx.add(1);
    } else {
      http5xx.add(0);
    }
    if (r.status !== 200 || !r.accessToken || !r.refreshToken) {
      httpAuthLoginFailures.add(1);
      return null;
    }
    const userId =
      row.userId && String(row.userId).length
        ? String(row.userId)
        : readJwtSub(r.accessToken);
    if (!userId) {
      httpAuthLoginFailures.add(1);
      return null;
    }
    ent = {
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      userId,
    };
    cache[key] = ent;
    return { ...ent };
  }

  return null;
}
