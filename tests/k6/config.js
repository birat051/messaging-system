/**
 * k6 config — all scripts read **`__ENV`** (see `README.md`).
 * @file
 */
import { userPool } from './user-pool.js';

const K6_RUN_ID = String(__ENV.RUN_ID || 'k6-local');

/**
 * So **`--summary-export`** includes **`count`** on custom Trend metrics (e.g. `e2e_message_new_ms`)
 * for **`tests/k6/validate-k6-summary.mjs`**.
 */
const summaryTrendStats = [
  'count',
  'avg',
  'min',
  'med',
  'max',
  'p(90)',
  'p(95)',
  'p(99)',
];

/**
 * Target VU count for the **1:1 pair** harness: one VU = one pair = two `userPool` rows.
 * Single-row pool uses 1 VU (same as `iteration.js` fallback).
 * Optional **`K6_MAX_VUS`**: run with at most this many VUs (must be &gt; 0); capped to the pool-derived maximum.
 * @returns {number}
 */
export function resolveVusFromUserPool() {
  const n = userPool.length;
  if (n < 1) {
    throw new Error(
      'k6: user pool is empty; set USER_POOL_FILE to a JSON array with at least one user row',
    );
  }
  const maxPairs = Math.floor(n / 2);
  const fromPool = maxPairs >= 1 ? maxPairs : 1;
  const raw = __ENV.K6_MAX_VUS
    ? parseInt(String(__ENV.K6_MAX_VUS), 10)
    : NaN;
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(1, Math.min(fromPool, raw));
  }
  return fromPool;
}

/**
 * Parse a simple k6-style duration to seconds (`30s`, `5m`, `1h`); fallback **300** (5m).
 * @param {string | undefined} s
 * @returns {number}
 */
function parseDurationToSeconds(s) {
  const raw = String(s || '').trim();
  const m = raw.match(/^(\d+(?:\.\d+)?)(s|m|h)?$/i);
  if (!m) {
    return 300;
  }
  const n = parseFloat(m[1]);
  const u = (m[2] || 's').toLowerCase();
  if (u === 'h') {
    return Math.max(0, Math.round(n * 3600));
  }
  if (u === 'm') {
    return Math.max(0, Math.round(n * 60));
  }
  return Math.max(0, Math.round(n));
}

/**
 * k6-accepted duration string from whole seconds.
 * @param {number} sec
 * @returns {string}
 */
function formatDurationFromSeconds(sec) {
  if (sec < 60) {
    return `${sec}s`;
  }
  if (sec % 60 === 0) {
    return `${sec / 60}m`;
  }
  return `${sec}s`;
}

/**
 * JMeter-style **stepping** profile: **ramp up** → **sustain** → **ramp down** to 0.
 * 1) Increase VUs in **`K6_RAMP_STEPS`** stages from **0** to **`targetVus`**, over **`K6_RAMP_UP_DURATION`**, then
 * 2) Hold at **`K6_SUSTAIN_DURATION`** (default **10m**) at **`targetVus`**, then
 * 3) Decrease VUs in **`K6_RAMP_DOWN_STEPS`** stages to **0** over **`K6_RAMP_DOWN_DURATION`**.
 * - **`K6_RAMP_STEPS=1`**: one linear 0 → target over the full ramp up window.
 * - **`K6_RAMP_DOWN_DURATION`**: omit to mirror **ramp up** total time; set **`0s`** to skip ramp down (sustain is the last load stage).
 * - **`K6_RAMP_DOWN_STEPS`**: defaults to **`K6_RAMP_STEPS`**.
 * Target VUs: **`resolveVusFromUserPool()`** and optional **`K6_MAX_VUS`**.
 * @returns {import('k6/options').Options}
 */
export function getSteppingOptions() {
  const targetVus = resolveVusFromUserPool();
  const rampUpTotal = __ENV.K6_RAMP_UP_DURATION || '5m';
  const sustain = __ENV.K6_SUSTAIN_DURATION || '10m';
  const rampSteps = Math.max(
    1,
    parseInt(String(__ENV.K6_RAMP_STEPS || '1'), 10) || 1,
  );
  const totalRampSec = parseDurationToSeconds(rampUpTotal);
  const perStepSec = Math.max(1, Math.floor(totalRampSec / rampSteps));

  /** @type {Array<{ duration: string, target: number }>} */
  const stages = [];
  for (let s = 1; s <= rampSteps; s += 1) {
    const target =
      s === rampSteps
        ? targetVus
        : Math.max(0, Math.round((targetVus * s) / rampSteps));
    stages.push({
      duration: formatDurationFromSeconds(perStepSec),
      target,
    });
  }
  stages.push({ duration: sustain, target: targetVus });

  const rawDown = __ENV.K6_RAMP_DOWN_DURATION;
  const hasExplicitDown =
    rawDown !== undefined && String(rawDown).trim() !== '';
  const downTotalStr = hasExplicitDown
    ? String(rawDown).trim()
    : rampUpTotal;
  const totalDownSec = parseDurationToSeconds(downTotalStr);

  let downPathLog = '';
  if (totalDownSec > 0) {
    const downSteps = Math.max(
      1,
      parseInt(
        String(__ENV.K6_RAMP_DOWN_STEPS || String(rampSteps)),
        10,
      ) || 1,
    );
    const perStepDownSec = Math.max(1, Math.floor(totalDownSec / downSteps));
    /** @type {number[]} */
    const downPath = [targetVus];
    for (let j = 1; j <= downSteps; j += 1) {
      const t =
        j === downSteps
          ? 0
          : Math.max(0, Math.round((targetVus * (downSteps - j)) / downSteps));
      downPath.push(t);
      stages.push({
        duration: formatDurationFromSeconds(perStepDownSec),
        target: t,
      });
    }
    downPathLog = ` rampDownTotal=${downTotalStr} downSteps=${downSteps} (~${formatDurationFromSeconds(perStepDownSec)}/step) downPath=${downPath.join('→')}`;
  } else {
    downPathLog = ' rampDown=off(0s)';
  }

  const rampOnly = stages.slice(0, rampSteps);
  const rampTargetPath = [0, ...rampOnly.map((st) => st.target)].join('→');
  console.log(
    `[k6 stepping] targetVUs=${targetVus} rampSteps=${rampSteps} rampTotal=${rampUpTotal} (~${formatDurationFromSeconds(perStepSec)}/step) upPath=${rampTargetPath} sustain=${sustain}@${targetVus}${downPathLog}`,
  );

  return {
    scenarios: {
      stepping: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages,
        gracefulRampDown: '60s',
        gracefulStop: '120s',
        tags: { scenario: 'stepping', run_id: K6_RUN_ID },
      },
    },
    thresholds: {
      http_req_failed: ['rate<0.1'],
    },
    summaryTrendStats,
  };
}

/**
 * @typedef {Object} K6Config
 * @property {string} baseUrl  REST base including `/v1` (e.g. `https://ekko…/v1`)
 * @property {string} wsUrl     Socket.IO **origin** only — no path (e.g. `wss://ekko…`)
 * @property {string} userPoolFile
 * @property {string} runId
 * @property {number} messageRate   Messages per second per **active** sender (used for `sleep` spacing)
 * @property {number} mediaRatio    0..1 — fraction of iterations that *would* use media (ST-2 follow-up: presign)
 * @property {string} receiptMode  `none` | `delivered_only` | `full`
 * @property {number} jwtExpiryBufferSec  if JWT `exp` is within this many **seconds** of `now`, call `/auth/refresh` before opening sockets (soak / long iterations)
 * @property {number} thinkMinSec
 * @property {number} thinkMaxSec
 * @property {number} burstCount  sequential `message:send` with `burstInnerSec` gap
 * @property {number} burstInnerSec
 * @property {number} activeSendProbability  0..1 — fraction of iterations that **send** (vs **idle** connect-only)
 * @property {number} idleHoldSec  keep both sockets up this long on idle iterations
 * @property {number} receiptReadDelayMs  full receipts: pause after **delivered** before **read**
 * @property {number} receiptConversationDelayMs  optional pause before **conversation:read**
 * @property {number} mediaSimulateSec  when MEDIA_RATIO “hits”, extra think before send (text body unchanged)
 * @property {number} textBodyPadMinBytes  optional extra text bytes in body JSON (`pad` field) — 0 = small JSON only
 * @property {number} textBodyPadMaxBytes  uniform random in [min,max] per send when max &gt; 0
 * @property {number} sioMaxWaitMs
 */

/**
 * @returns {K6Config}
 */
export function getConfig() {
  return {
    baseUrl: (__ENV.BASE_URL || 'http://localhost:8080/v1').replace(/\/$/, ''),
    wsUrl: (__ENV.WS_URL || 'http://localhost:8080').replace(/\/$/, ''),
    userPoolFile: __ENV.USER_POOL_FILE || 'tests/k6/users.example.json',
    runId: __ENV.RUN_ID || 'k6-local',
    messageRate: parseFloat(__ENV.MESSAGE_RATE || '0.2'),
    mediaRatio: Math.min(
      1,
      Math.max(0, parseFloat(__ENV.MEDIA_RATIO || '0')),
    ),
    receiptMode: (__ENV.RECEIPT_MODE || 'full').toLowerCase(),
    jwtExpiryBufferSec: (() => {
      const n = parseInt(String(__ENV.K6_JWT_BUFFER_SEC || '120'), 10);
      return Number.isFinite(n) && n > 0 ? n : 120;
    })(),
    thinkMinSec: Math.max(0, parseFloat(__ENV.K6_THINK_MIN_SEC || '0') || 0),
    thinkMaxSec: Math.max(
      0,
      parseFloat(__ENV.K6_THINK_MAX_SEC || '0.5') || 0.5,
    ),
    burstCount: (() => {
      const n = parseInt(String(__ENV.K6_BURST_COUNT || '1'), 10);
      return Number.isFinite(n) && n >= 1 ? n : 1;
    })(),
    burstInnerSec: Math.max(0, parseFloat(__ENV.K6_BURST_INNER_SEC || '0.05') || 0.05),
    activeSendProbability: Math.min(
      1,
      Math.max(0, parseFloat(__ENV.K6_ACTIVE_SEND_PROB || '1') || 1),
    ),
    idleHoldSec: Math.max(0.1, parseFloat(__ENV.K6_IDLE_HOLD_SEC || '3') || 3),
    receiptReadDelayMs: (() => {
      const n = parseInt(String(__ENV.K6_RECEIPT_READ_DELAY_MS || '200'), 10);
      return Number.isFinite(n) && n >= 0 ? n : 200;
    })(),
    receiptConversationDelayMs: (() => {
      const n = parseInt(
        String(__ENV.K6_RECEIPT_CONVERSATION_DELAY_MS || '0'),
        10,
      );
      return Number.isFinite(n) && n >= 0 ? n : 0;
    })(),
    mediaSimulateSec: Math.max(
      0,
      parseFloat(__ENV.K6_MEDIA_SIMULATE_SEC || '0.15') || 0.15,
    ),
    textBodyPadMinBytes: (() => {
      const n = parseInt(String(__ENV.K6_TEXT_BODY_PAD_MIN_BYTES || '0'), 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    })(),
    textBodyPadMaxBytes: (() => {
      const n = parseInt(String(__ENV.K6_TEXT_BODY_PAD_MAX_BYTES || '0'), 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    })(),
    sioMaxWaitMs: (() => {
      const n = parseInt(String(__ENV.K6_SIO_MAX_WAIT_MS || '90000'), 10);
      return Number.isFinite(n) && n >= 5000 ? n : 90000;
    })(),
  };
}
