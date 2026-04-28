import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **`docs/PROJECT_PLAN.md` §14** (testing): do not use **`VITE_*`** env vars to inject **user ids**,
 * **tokens**, or dev identities — identity must come from **session** data; use **MSW** + **Redux
 * `preloadedState`** / **`401`** mocks instead.
 *
 * **vi.stubEnv** with **VITE_** keys in tests is only allowed for **non-identity** client config (see
 * **`ALLOWED_VITE_STUB_KEY_PATTERNS`**). Extend that list when adding a new **legitimate** stub;
 * do **not** add patterns for user impersonation.
 */
const ALLOWED_VITE_STUB_KEY_PATTERNS: ReadonlyArray<RegExp> = [
  /^VITE_S3_/,
  /^VITE_API_BASE_URL$/,
  /^VITE_WEBRTC_/,
  /^VITE_DEVICE_KEY_SYNC_PAGE_LIMIT$/,
  /^VITE_REVOKE_DEVICE_ON_LOGOUT$/,
  /** Upload size cap for client validation tests (not identity). */
  /^VITE_MEDIA_UPLOAD_MAX_BYTES$/,
];

const STUB_ENV_KEY_RE = /stubEnv\s*\(\s*['"](VITE_[^'"]+)['"]/g;

function collectTestFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      collectTestFiles(p, acc);
    } else if (/\.(test|spec)\.(tsx?|jsx?|mts|cts)$/.test(name.name)) {
      acc.push(p);
    }
  }
  return acc;
}

function isAllowedViteStubKey(key: string): boolean {
  return ALLOWED_VITE_STUB_KEY_PATTERNS.some((re) => re.test(key));
}

describe('VITE_* stub policy (session / identity)', () => {
  it('does not use vi.stubEnv for disallowed VITE_* keys (use HTTP session + MSW / 401 mocks)', () => {
    const srcRoot = join(process.cwd(), 'src');
    const files = collectTestFiles(srcRoot);
    const violations: string[] = [];

    for (const file of files) {
      if (file.endsWith('viteEnvSecurityPolicy.test.ts')) {
        continue;
      }
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const m of text.matchAll(STUB_ENV_KEY_RE)) {
        const key = m[1];
        if (!isAllowedViteStubKey(key)) {
          violations.push(`${file}: stubEnv('${key}')`);
        }
      }
    }

    expect(
      violations,
      `Disallowed VITE_* stubs — mock session via Redux preloadedState + MSW handlers, not env-based user/token injection. See docs/PROJECT_PLAN.md §14.\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
