import { describe, expect, it } from 'vitest';
import {
  PRESENCE_HEARTBEAT_REDIS_WRITE_MIN_INTERVAL_MS,
  presenceHeartbeatAllowsRedisWrite,
} from './presenceHeartbeatThrottle.js';

describe('presenceHeartbeatAllowsRedisWrite', () => {
  it('allows the first write on a socket (lastWrite === 0)', () => {
    expect(presenceHeartbeatAllowsRedisWrite(0, 1_000_000)).toBe(true);
  });

  it('blocks a second write before the min interval elapses', () => {
    const t0 = 10_000;
    expect(presenceHeartbeatAllowsRedisWrite(t0, t0 + 1000)).toBe(false);
    expect(
      presenceHeartbeatAllowsRedisWrite(
        t0,
        t0 + PRESENCE_HEARTBEAT_REDIS_WRITE_MIN_INTERVAL_MS - 1,
      ),
    ).toBe(false);
  });

  it('allows a write once the min interval has elapsed', () => {
    const t0 = 50_000;
    expect(
      presenceHeartbeatAllowsRedisWrite(
        t0,
        t0 + PRESENCE_HEARTBEAT_REDIS_WRITE_MIN_INTERVAL_MS,
      ),
    ).toBe(true);
  });
});
