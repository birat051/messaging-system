/**
 * **Step-up ramp** (multiple `ramping-vus` stages), then **sustain** at target load.
 *
 * - **Target VUs** from the user pool: one VU = one 1:1 pair = two pool entries (see `resolveVusFromUserPool` in `config.js`).
 * - **`K6_RAMP_STEPS`**: how many step-up increases from 0 to target ( **1** = single linear ramp over `K6_RAMP_UP_DURATION` ). Total ramp time = **`K6_RAMP_UP_DURATION`**, split evenly across those steps.
 * - **`K6_SUSTAIN_DURATION`**: hold at full target (default 10m if unset).
 * - **`K6_RAMP_DOWN_DURATION`** / **`K6_RAMP_DOWN_STEPS`**: stepped ramp down to **0** after sustain; omit duration to **mirror** ramp up time; set **`0s`** to skip ramp down.
 * - Optional **`K6_MAX_VUS`**: cap VUs.
 *
 * @example
 * k6 run -e USER_POOL_FILE=tests/k6/users.example.json \
 *   -e K6_RAMP_STEPS=5 -e K6_RAMP_UP_DURATION=10m -e K6_SUSTAIN_DURATION=15m -e K6_RAMP_DOWN_DURATION=10m \
 *   tests/k6/scenarios/stepping.js
 * @file
 */
import { getSteppingOptions } from '../config.js';
import { runLoadIteration } from '../iteration.js';

export const options = getSteppingOptions();

export default function () {
  runLoadIteration();
}
