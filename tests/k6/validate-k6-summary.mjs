/**
 * Read k6 **`--summary-export`** JSON and verify §1 / ST-3 “data validation” invariants
 * (drops, duplicates, sent vs `message:new` samples, optional receipt counts).
 *
 *   k6 run --summary-export=summary.json … tests/k6/scenarios/stepping.js
 *   node tests/k6/validate-k6-summary.mjs summary.json
 *
 * Exit **1** on failure, **0** on success. Tweak with env (see **--help**).
 *
 * @file
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`
validate-k6-summary.mjs <summary.json>

Reads k6 end-of-test summary (use: k6 run --summary-export=...).

Env (optional):
  K6_VAL_MAX_DROPS          max allowed dropped_messages_total (default: 0)
  K6_VAL_MAX_DUPLICATES     max allowed duplicate_message_new_total (default: 0)
  K6_VAL_E2E_STRICT=1      require e2e_message_new_ms count == msg_send_acked_total when both &gt; 0
  K6_VAL_RECEIPT_MODE     none | delivered_only | full — if set, check receipt_events_total
                          vs msg_send_acked (delivered: ~1x, full: ~3x per message acked)
  K6_VAL_IGNORE_MISSING=1  if metrics absent, exit 0 (smoke with stub / no send path)
`);
  process.exit(0);
}

const file = argv[0];
if (!file) {
  console.error('Usage: node tests/k6/validate-k6-summary.mjs <summary.json>');
  process.exit(2);
}

const raw = readFileSync(resolve(file), 'utf8');
const data = JSON.parse(raw);
const metrics = data.metrics || {};

const maxDrops = parseInt(String(process.env.K6_VAL_MAX_DROPS ?? '0'), 10) || 0;
const maxDups = parseInt(String(process.env.K6_VAL_MAX_DUPLICATES ?? '0'), 10) || 0;
const e2eStrict = String(process.env.K6_VAL_E2E_STRICT || '') === '1';
const receiptMode = (process.env.K6_VAL_RECEIPT_MODE || '')
  .toLowerCase()
  .trim();
const ignoreMissing = String(process.env.K6_VAL_IGNORE_MISSING || '') === '1';

/**
 * @param {string} name
 * @returns {number | null}
 */
function counterValue(name) {
  const m = metrics[name];
  if (!m || m.type !== 'counter') {
    return null;
  }
  const c = m.values && typeof m.values.count === 'number' ? m.values.count : 0;
  return c;
}

/**
 * @param {string} name
 * @returns {number | null}
 */
function trendCount(name) {
  const m = metrics[name];
  if (!m || m.type !== 'trend') {
    return null;
  }
  const c = m.values && typeof m.values.count === 'number' ? m.values.count : null;
  return c;
}

const dropped = counterValue('dropped_messages_total');
const dups = counterValue('duplicate_message_new_total');
const acks = counterValue('msg_send_acked_total');
const receipts = counterValue('receipt_events_total');
const e2eN = trendCount('e2e_message_new_ms');

if (
  ignoreMissing &&
  dropped == null &&
  dups == null &&
  acks == null
) {
  console.log('OK (K6_VAL_IGNORE_MISSING: no relevant counters in summary).');
  process.exit(0);
}

const errors = [];
const warns = [];

if (dropped == null) {
  if (!ignoreMissing) {
    warns.push('metric dropped_messages_total missing (export may be empty or k6 too old).');
  }
} else if (dropped > maxDrops) {
  errors.push(
    `dropped_messages_total=${dropped} exceeds K6_VAL_MAX_DROPS=${maxDrops}`,
  );
}

if (dups == null) {
  if (!ignoreMissing) {
    warns.push('metric duplicate_message_new_total missing.');
  }
} else if (dups > maxDups) {
  errors.push(
    `duplicate_message_new_total=${dups} exceeds K6_VAL_MAX_DUPLICATES=${maxDups}`,
  );
}

if (e2eStrict) {
  if (acks == null || e2eN == null) {
    if (!ignoreMissing) {
      errors.push('K6_VAL_E2E_STRICT: need msg_send_acked_total and e2e_message_new_ms (trend) with count in summary — set summaryTrendStats in k6 `options` (see `config.js`).');
    }
  } else if (acks > 0 && e2eN > 0 && acks !== e2eN) {
    errors.push(
      `sent vs received: msg_send_acked_total=${acks} but e2e_message_new_ms count=${e2eN} (expect equal when every ack leads to one message:new on B).`,
    );
  }
}

if (receiptMode && acks != null && acks > 0) {
  if (receipts == null) {
    if (!ignoreMissing) {
      warns.push('K6_VAL_RECEIPT_MODE set but receipt_events_total missing.');
    }
  } else {
    if (receiptMode === 'none' || receiptMode === 'off') {
      if (receipts !== 0) {
        errors.push(
          `RECEIPT_MODE none: expected receipt_events_total=0, got ${receipts}.`,
        );
      }
    } else if (receiptMode === 'delivered_only') {
      if (receipts < acks) {
        errors.push(
          `delivered_only: expected receipt_events_total >= msg_send_acked_total (${receipts} < ${acks}).`,
        );
      }
    } else if (receiptMode === 'full') {
      if (receipts < acks * 3) {
        errors.push(
          `full: expected receipt_events_total >= 3 * msg_send_acked (${receipts} < ${acks * 3}).`,
        );
      }
    }
  }
}

for (const w of warns) {
  console.warn(`[warn] ${w}`);
}

if (errors.length) {
  for (const e of errors) {
    console.error(`[fail] ${e}`);
  }
  process.exit(1);
}

console.log(
  'OK: data validation —',
  `drops=${dropped ?? 'n/a'}, dups=${dups ?? 'n/a'}, msg_send_acked_total=${acks ?? 'n/a'}, e2e_message_new count=${e2eN ?? 'n/a'}, receipt_events_total=${receipts ?? 'n/a'}.`,
);
process.exit(0);
