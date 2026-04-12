import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './common/mocks/server';

/**
 * jsdom may expose **`crypto.subtle`** as a stub; **`if (!subtle)`** then never replaces it and
 * PBKDF2/AES-GCM round-trips fail. Always use Node’s **`webcrypto`** in tests.
 */
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
  writable: true,
});

/** **`SubtleCrypto`** and IndexedDB private-key helpers require a secure context in real browsers. */
Object.defineProperty(window, 'isSecureContext', {
  value: true,
  configurable: true,
  writable: true,
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

/** Deterministic theme resolution in tests (avoid `prefers-color-scheme` flakiness). */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
