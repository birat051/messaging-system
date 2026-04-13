import axios from 'axios';
import { describe, expect, it } from 'vitest';
import {
  isRateLimitedError,
  isRecipientPublicKeyNonRetryableClientError,
  isTransientHttpRetryableError,
  parseApiError,
} from './apiError';

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

describe('isTransientHttpRetryableError', () => {
  it('returns true for network (no response)', () => {
    const err = new axios.AxiosError(
      'Network Error',
      'ERR_NETWORK',
      undefined,
      undefined,
      undefined,
    );
    expect(isTransientHttpRetryableError(err)).toBe(true);
  });

  it('returns true for 429, 502, 503', () => {
    for (const status of [429, 502, 503]) {
      const err = new axios.AxiosError(
        'fail',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status,
          statusText: '',
          data: {},
          headers: {},
          config: {} as never,
        },
      );
      expect(isTransientHttpRetryableError(err)).toBe(true);
    }
  });

  it('returns false for 401 and 404', () => {
    for (const status of [401, 404]) {
      const err = new axios.AxiosError(
        'fail',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status,
          statusText: '',
          data: {},
          headers: {},
          config: {} as never,
        },
      );
      expect(isTransientHttpRetryableError(err)).toBe(false);
    }
  });

  it('returns false for non-axios errors', () => {
    expect(isTransientHttpRetryableError(new Error('x'))).toBe(false);
  });
});

describe('isRecipientPublicKeyNonRetryableClientError', () => {
  it('returns true for 400 and false for 404 / 429 / 5xx / network', () => {
    const mk = (status: number) =>
      new axios.AxiosError(
        'fail',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status,
          statusText: '',
          data: {},
          headers: {},
          config: {} as never,
        },
      );

    expect(isRecipientPublicKeyNonRetryableClientError(mk(400))).toBe(true);
    expect(isRecipientPublicKeyNonRetryableClientError(mk(404))).toBe(false);
    expect(isRecipientPublicKeyNonRetryableClientError(mk(429))).toBe(false);
    expect(isRecipientPublicKeyNonRetryableClientError(mk(503))).toBe(false);
    expect(
      isRecipientPublicKeyNonRetryableClientError(
        new axios.AxiosError('net', 'ERR_NETWORK'),
      ),
    ).toBe(false);
  });
});
