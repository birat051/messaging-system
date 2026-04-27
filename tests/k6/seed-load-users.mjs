/**
 * Register **load** accounts for k6: `load-user-0001` … `load-user-NNNN` (email local-part),
 * deterministic usernames, shared password.
 *
 * Requires messaging-service with **`POST /v1/auth/register`**; for accounts to **log in
 * immediately**, use **`EMAIL_VERIFICATION_REQUIRED=false`** in dev (or `system_config`) so
 * new users are email-verified on register.
 *
 * Usage (from repo root):
 *
 *   K6_LOAD_USER_PASSWORD='your-secure-8+chars' \
 *   K6_LOAD_USER_COUNT=20 \
 *   node tests/k6/seed-load-users.mjs
 *
 * Write pool JSON for k6 (gitignored by default: `tests/k6/users.json`):
 *
 *   K6_LOAD_USER_PASSWORD='...' K6_LOAD_USER_COUNT=20 \
 *     node tests/k6/seed-load-users.mjs --write-pool=tests/k6/users.json
 *
 * Print pool JSON to stdout only (no HTTP):
 *
 *   K6_LOAD_USER_PASSWORD='...' K6_LOAD_USER_COUNT=4 \
 *     node tests/k6/seed-load-users.mjs --print-pool-only
 *
 * @file
 */
import { writeFileSync } from "node:fs";

const JSON_HDR = { "Content-Type": "application/json" };

const rawArgs = process.argv.slice(2);
const writePoolPath = (() => {
  const j = rawArgs.find((a) => a.startsWith("--write-pool="));
  if (!j) {
    return null;
  }
  return j.split("=").slice(1).join("=") || null;
})();

const printPoolOnly = rawArgs.includes("--print-pool-only");
const help = rawArgs.includes("--help") || rawArgs.includes("-h");

if (help) {
  console.log(`
seed-load-users.mjs — register load-user-0001..N for k6

Env:
  K6_LOAD_USER_COUNT   (default: 10)  number of accounts
  K6_LOAD_USER_PASSWORD (required)     min 8 chars; used for all accounts
  BASE_URL            (default: http://localhost:8080/v1)  API base with /v1
  K6_LOAD_USER_EMAIL_DOMAIN  (default: loadtest.local)   email host

Flags:
  --write-pool=PATH    write { email, password }[] for k6 USER_POOL_FILE
  --print-pool-only     only print/write pool JSON; no register calls
  --help
`);
  process.exit(0);
}

const count = Math.max(1, Number(process.env.K6_LOAD_USER_COUNT || "10") | 0);
const password = String(process.env.K6_LOAD_USER_PASSWORD || "");
const baseUrl = String(
  process.env.BASE_URL || "http://localhost:8080/v1",
).replace(/\/$/, "");
const domain = String(
  process.env.K6_LOAD_USER_EMAIL_DOMAIN || "loadtest.local",
);

function pad4(n) {
  return String(n).padStart(4, "0");
}

/**
 * @param {number} i  1..N
 */
function rowForIndex(i) {
  const p = pad4(i);
  return {
    email: `load-user-${p}@${domain}`,
    password,
    username: `loadu_${p}`,
    displayName: `Load user ${p}`,
  };
}

/**
 * k6 only needs { email, password } per **tests/k6/user-pool.js**.
 * @param {{ email: string, password: string }[]} rows
 * @param {string} path
 */
function writePoolFile(rows, path) {
  const minimal = rows.map((r) => ({ email: r.email, password: r.password }));
  writeFileSync(path, JSON.stringify(minimal, null, 2) + "\n", "utf8");
  console.log(`Wrote ${minimal.length} rows to ${path}`);
}

/**
 * @returns {{ email: string, password: string, username: string, displayName: string }[]}
 */
function buildAllRows() {
  const out = [];
  for (let i = 1; i <= count; i++) {
    out.push(rowForIndex(i));
  }
  return out;
}

if (printPoolOnly) {
  if (password.length < 8) {
    console.error(
      "K6_LOAD_USER_PASSWORD must be at least 8 characters (API requirement).",
    );
    process.exit(1);
  }
  const rows = buildAllRows();
  if (writePoolPath) {
    writePoolFile(rows, writePoolPath);
  } else {
    const minimal = rows.map((r) => ({ email: r.email, password: r.password }));
    console.log(JSON.stringify(minimal, null, 2));
  }
  process.exit(0);
}

if (password.length < 8) {
  console.error(
    "Set K6_LOAD_USER_PASSWORD to a string of at least 8 characters (register schema).",
  );
  process.exit(1);
}

const rows = buildAllRows();

let ok = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const body = JSON.stringify({
    email: row.email,
    password: row.password,
    username: row.username,
    displayName: row.displayName,
  });
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: JSON_HDR,
    body,
  });
  if (res.status === 201) {
    ok++;
    const j = await res.json().catch(() => ({}));
    if (j && j.accessToken == null && j.refreshToken == null) {
      console.warn(
        `[warn] ${row.email} registered but no tokens (email verification required?).`,
      );
    }
    continue;
  }
  if (res.status === 409) {
    skipped++;
    console.log(`[skip] ${row.email} already exists (409).`);
    continue;
  }
  failed++;
  const t = await res.text();
  console.error(`[fail] ${row.email} HTTP ${res.status} ${t.slice(0, 200)}`);
}

console.log(
  `Done: ${ok} registered, ${skipped} already present, ${failed} failed (count=${count}).`,
);
if (failed > 0) {
  process.exit(1);
}

if (writePoolPath) {
  writePoolFile(rows, writePoolPath);
}
