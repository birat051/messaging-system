import axios from 'axios';
import type { components } from '../../../generated/api-types';

type ErrorResponse = components['schemas']['ErrorResponse'];

/**
 * Parses **`ErrorResponse`** from **`application/json`** error bodies (`code` + **`message`**).
 * If only **`message`** is present, **`code`** is set to **`UNKNOWN`**.
 */
export function getErrorResponse(err: unknown): ErrorResponse | null {
  if (!axios.isAxiosError(err) || err.response?.data == null) {
    return null;
  }
  const d = err.response.data as Record<string, unknown>;
  if (typeof d.message !== 'string') {
    return null;
  }
  const code = typeof d.code === 'string' ? d.code : 'UNKNOWN';
  return { code, message: d.message };
}

/** Normalized API failure for UI — always has a **`message`**; **`code`** when the server sent one (or **`UNKNOWN`**). */
export type ParsedApiError = {
  code: string | null;
  message: string;
  httpStatus?: number;
};

/**
 * Maps Axios failures (including **429** **`RATE_LIMIT_EXCEEDED`**) to UI-safe text. Prefer server **`message`** when present.
 * **`httpClient`** rejects **429** without refresh/retry — use this (or **`getApiErrorMessage`**) for user-visible feedback.
 */
export function parseApiError(err: unknown): ParsedApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const er = getErrorResponse(err);
    if (er) {
      return {
        code: er.code === 'UNKNOWN' ? null : er.code,
        message: er.message,
        httpStatus: status,
      };
    }
    const raw = err.response?.data;
    if (typeof raw === 'object' && raw !== null && 'message' in raw) {
      const m = (raw as { message?: unknown }).message;
      if (typeof m === 'string') {
        return {
          code: null,
          message: m,
          httpStatus: status,
        };
      }
    }
    if (err.response == null) {
      return {
        code: null,
        message:
          'Network error. Check your connection and try again.',
      };
    }
    if (status === 413) {
      return {
        code: null,
        message: 'Request was too large. Try a smaller file.',
        httpStatus: status,
      };
    }
    if (status === 429) {
      return {
        code: null,
        message: 'Too many requests. Wait a moment and try again.',
        httpStatus: status,
      };
    }
    return {
      code: null,
      message: err.message || 'Request failed',
      httpStatus: status,
    };
  }
  if (err instanceof Error) {
    return { code: null, message: err.message };
  }
  return { code: null, message: 'Something went wrong.' };
}

/** Safe message for UI — prefers **`ErrorResponse.message`**. */
export function getApiErrorMessage(err: unknown): string {
  return parseApiError(err).message;
}

/** **429** from **`httpClient`** — global **`warning`** toast may already be shown; avoid duplicate **`toast.error`** in **`catch`**. */
export function isRateLimitedError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 429;
}

/** **`POST /auth/login`** — **401** invalid credentials vs **403** email not verified (`EMAIL_NOT_VERIFIED`). */
export type LoginFailureKind =
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'other';

export function parseLoginError(err: unknown): {
  kind: LoginFailureKind;
  message: string;
  code: string | null;
} {
  const parsed = parseApiError(err);
  if (!axios.isAxiosError(err)) {
    return { kind: 'other', message: parsed.message, code: parsed.code };
  }
  const status = err.response?.status;
  const raw = err.response?.data;
  const rawCode =
    typeof raw === 'object' && raw !== null && typeof (raw as { code?: unknown }).code === 'string'
      ? (raw as { code: string }).code
      : null;
  if (status === 403 || rawCode === 'EMAIL_NOT_VERIFIED') {
    return {
      kind: 'email_not_verified',
      message: parsed.message,
      code: parsed.code,
    };
  }
  if (status === 401) {
    return {
      kind: 'invalid_credentials',
      message: parsed.message,
      code: parsed.code,
    };
  }
  return { kind: 'other', message: parsed.message, code: parsed.code };
}
