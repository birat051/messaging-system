/**
 * Matches **messaging-service** **`PRESENCE_HEARTBEAT_REDIS_WRITE_MIN_INTERVAL_MS`** (4500) — fastest safe client tick.
 */
export const PRESENCE_HEARTBEAT_COMPACT_MS = 4500;

/** Default / background cadence (~5s) when the active thread is not in “live” mode. */
export const PRESENCE_HEARTBEAT_RELAXED_MS = 5000;
