import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl, getSocketUrl } from './apiConfig';

describe('apiConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getSocketUrl uses origin of absolute VITE_API_BASE_URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080/v1');
    expect(getSocketUrl()).toBe('http://localhost:8080');
  });

  it('getSocketUrl uses window.location.origin for relative API base', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/v1');
    expect(getSocketUrl()).toBe(window.location.origin);
  });

  it('getApiBaseUrl joins relative base to window origin', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/v1');
    expect(getApiBaseUrl()).toBe(`${window.location.origin}/v1`);
  });

  it('getSocketUrl falls back when absolute URL is not parseable', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://');
    expect(getSocketUrl()).toBe('http://localhost:8080');
  });
});
