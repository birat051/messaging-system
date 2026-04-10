import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { isRateLimitedError, parseApiError } from './apiError';

describe('parseApiError — 429 / rate limits', () => {
  it('uses ErrorResponse body for RATE_LIMIT_EXCEEDED (global limit)', () => {
    const err = new axios.AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 429,
        statusText: 'Too Many Requests',
        data: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests; try again later',
        },
        headers: {},
        config: {} as never,
      },
    );
    const p = parseApiError(err);
    expect(p.httpStatus).toBe(429);
    expect(p.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(p.message).toBe('Too many requests; try again later');
  });

  it('uses fallback copy when 429 has no ErrorResponse shape', () => {
    const err = new axios.AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 429,
        statusText: 'Too Many Requests',
        data: {},
        headers: {},
        config: {} as never,
      },
    );
    const p = parseApiError(err);
    expect(p.httpStatus).toBe(429);
    expect(p.message).toBe('Too many requests. Wait a moment and try again.');
  });
});

describe('isRateLimitedError', () => {
  it('returns true for axios 429', () => {
    const err = new axios.AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 429,
        statusText: 'Too Many Requests',
        data: {},
        headers: {},
        config: {} as never,
      },
    );
    expect(isRateLimitedError(err)).toBe(true);
  });

  it('returns false for other statuses', () => {
    const err = new axios.AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 500,
        statusText: 'Error',
        data: {},
        headers: {},
        config: {} as never,
      },
    );
    expect(isRateLimitedError(err)).toBe(false);
  });
});
