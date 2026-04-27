/**
 * Realistic load shaping — think time, **active** vs **idle** iterations, **MEDIA_RATIO** (optional tranche: extra delay only; text **message:send** still — see README “Payload mix”).
 * @file
 */
import { sleep } from 'k6';

/**
 * @param {number} minSec
 * @param {number} maxSec
 * @returns {number}
 */
export function randomInRangeSec(minSec, maxSec) {
  if (maxSec <= minSec) {
    return minSec;
  }
  return minSec + Math.random() * (maxSec - minSec);
}

/**
 * @param {import('./config.js').K6Config} c
 * @returns {void}
 */
export function sleepPreActionThink(c) {
  const a = c.thinkMinSec;
  const b = c.thinkMaxSec;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  sleep(randomInRangeSec(lo, hi));
}

/**
 * With probability **1 − activeSendProbability**, the iteration only **opens** both sockets, holds, then
 * disconnects (idle load — `docs/scalability-methodology` §1 `connected_sockets` without `message:send`).
 * @param {import('./config.js').K6Config} c
 * @returns {boolean}
 */
export function isActiveMessageIteration(c) {
  return Math.random() < c.activeSendProbability;
}

/**
 * **MEDIA_RATIO** (secondary to text 1:1): with probability `mediaRatio`, add a small extra delay
 * to simulate the user in the “attachment / presign” path — **the hot path is still a text `message:send`**
 * (no presign HTTP in k6 by default; see `README`).
 * @param {import('./config.js').K6Config} c
 * @returns {void}
 */
export function sleepMediaTrancheIfAny(c) {
  if (c.mediaRatio > 0 && Math.random() < c.mediaRatio) {
    sleep(c.mediaSimulateSec);
  }
}
