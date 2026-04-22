/**
 * **Feature 11 — hybrid E2EE inner plaintext (v1).**
 *
 * AES-GCM encrypts a **UTF-8 string**. For messages with a **media locator**, clients use a small JSON object
 * so the **object key** and optional **retrievable URL** (or **base + key**) stay inside the ciphertext —
 * **`Message.mediaKey` on the wire is then null** for hybrid sends (see **`docs/PROJECT_PLAN.md` §7.1**).
 *
 * **Text-only** hybrid messages may still use a **raw UTF-8 string** (no JSON) for backward compatibility.
 */

import {
  buildMediaUrlFromPublicBasePrefixAndKey,
  getMediaPublicBasePrefix,
  getMediaPublicObjectUrl,
} from '@/common/utils/mediaPublicUrl';

export const HYBRID_MESSAGE_PLAINTEXT_V1 = 1 as const;

/** Inner JSON for **`HYBRID_MESSAGE_PLAINTEXT_V1`** — short keys to limit ciphertext size. */
export type HybridMessagePlaintextWireV1 = {
  v: typeof HYBRID_MESSAGE_PLAINTEXT_V1;
  /** Caption (optional). */
  t?: string;
  /**
   * Media — **`k`**: object key; **`u`**: full retrievable **http(s)** URL when known; **`b`**: public base
   * prefix (no trailing slash) when **`u`** is omitted but recipients should build a URL without local env.
   */
  m?: { k?: string; u?: string; b?: string };
};

export type ParsedHybridPlaintext = {
  /** User-visible caption; may be empty when media-only. */
  text: string;
  /** Resolved storage key when the v1 payload carries **`m.k`**. */
  mediaObjectKey: string | null;
  /**
   * Retrievable **http(s)** URL: from **`m.u`**, or built from **`m.b`** + **`m.k`** when **`m.u`** is absent.
   */
  mediaRetrievableUrl: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Accepts **http:** / **https:** URLs for **`m.u`** / preview overrides. */
export function sanitizeHttpUrlForMediaLocator(raw: string): string | null {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

function sanitizePublicBasePrefix(raw: string): string | null {
  const u = sanitizeHttpUrlForMediaLocator(raw);
  if (!u) {
    return null;
  }
  return u.replace(/\/$/, '');
}

/**
 * When **`mediaObjectKey`** is set, serializes **v1 JSON** (caption + **`m.k`**, and **`m.u`** and/or **`m.b`**).
 * Text-only messages continue to use **`encryptUtf8ToHybridSendPayload(rawText)`** with a raw string — no wrapper.
 */
export function serializeHybridInnerPlaintextV1(params: {
  text: string;
  mediaObjectKey: string | null;
  /**
   * Optional HTTPS URL from **`MediaUploadResponse.url`** — stored as **`m.u`** when valid.
   * When omitted, a URL may still be derived from env (**`getMediaPublicObjectUrl`**) or **`m.b`** only.
   */
  mediaRetrievableUrl?: string | null;
}): string {
  const caption = params.text;
  const key = params.mediaObjectKey?.trim() ?? '';
  if (!key) {
    return caption;
  }

  const explicitU = sanitizeHttpUrlForMediaLocator(
    params.mediaRetrievableUrl?.trim() ?? '',
  );
  const envFullUrl = sanitizeHttpUrlForMediaLocator(getMediaPublicObjectUrl(key) ?? '');
  const m: NonNullable<HybridMessagePlaintextWireV1['m']> = { k: key };
  if (explicitU) {
    m.u = explicitU;
  } else if (envFullUrl) {
    m.u = envFullUrl;
  } else {
    const base = getMediaPublicBasePrefix();
    if (base) {
      m.b = base;
    }
  }

  const o: HybridMessagePlaintextWireV1 = {
    v: HYBRID_MESSAGE_PLAINTEXT_V1,
    t: caption.length > 0 ? caption : undefined,
    m,
  };
  return JSON.stringify(o);
}

/**
 * After **`decryptHybridMessageToUtf8`**, converts wire UTF-8 to caption + optional attachment fields.
 * Raw non-JSON strings are treated as legacy **text-only** payloads.
 */
export function parseDecryptedHybridUtf8(utf8: string): ParsedHybridPlaintext {
  const legacyPlain = (full: string): ParsedHybridPlaintext => ({
    text: full,
    mediaObjectKey: null,
    mediaRetrievableUrl: null,
  });
  const s = utf8;
  if (!s.trim().startsWith('{')) {
    return legacyPlain(s);
  }
  try {
    const parsed: unknown = JSON.parse(s);
    if (!isRecord(parsed)) {
      return legacyPlain(s);
    }
    if (parsed.v !== HYBRID_MESSAGE_PLAINTEXT_V1) {
      return legacyPlain(s);
    }
    const t = parsed.t;
    const text = typeof t === 'string' ? t : '';
    const m = parsed.m;
    let mediaObjectKey: string | null = null;
    let mediaRetrievableUrl: string | null = null;
    if (isRecord(m)) {
      if (typeof m.k === 'string' && m.k.trim().length > 0) {
        mediaObjectKey = m.k.trim();
      }
      if (typeof m.u === 'string') {
        const u = sanitizeHttpUrlForMediaLocator(m.u);
        if (u) {
          mediaRetrievableUrl = u;
        }
      }
      if (!mediaRetrievableUrl && typeof m.b === 'string') {
        const b = sanitizePublicBasePrefix(m.b);
        if (b && mediaObjectKey) {
          mediaRetrievableUrl = buildMediaUrlFromPublicBasePrefixAndKey(b, mediaObjectKey);
        }
      }
    }
    return { text, mediaObjectKey, mediaRetrievableUrl };
  } catch {
    return legacyPlain(s);
  }
}
