/**
 * Seeded user rows for k6 — **JSON** **array** of `{ email, password }` (or with optional pre-minted tokens).
 * See `users.example.json` and `users.loadtest-pairs.example.json`.
 *
 * **Deterministic 1:1 pairs** (see `iteration.js`): the array is read in order.
 * - **Pair** *i* (0-based) = entries at `2*i` and `2*i+1`.
 * - **Total concurrent Socket.IO connections** in the default pair flow = **2 × (active VU count)**
 *   (user A and B each hold one open socket), which matches **pool length = 2 × VUS** when one pair is dedicated per VU.
 * @file
 */
import { SharedArray } from 'k6/data';

/**
 * k6 `open()` resolves **relative** paths from **`tests/k6/`** (this file’s directory), not the shell cwd.
 * So `USER_POOL_FILE=tests/k6/users.json` would wrongly become `tests/k6/tests/k6/users.json`. Support both
 * `users.json` and repo-root-style `tests/k6/users.json`.
 * @param {string} raw
 * @returns {string}
 */
function resolvePoolFilePath(raw) {
  if (raw.startsWith('/')) {
    return raw;
  }
  if (raw.startsWith('tests/k6/')) {
    return raw.slice('tests/k6/'.length);
  }
  return raw;
}

const file = resolvePoolFilePath(
  __ENV.USER_POOL_FILE || 'users.example.json',
);

export const userPool = new SharedArray('users', function loadUsers() {
  return JSON.parse(String(open(file)));
});
