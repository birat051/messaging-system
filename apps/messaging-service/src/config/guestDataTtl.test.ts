import { describe, expect, it } from 'vitest';
import type { Env } from './env.js';
import { computeGuestDataExpiresAt } from './guestDataTtl.js';
import type { EffectiveRuntimeConfig } from './runtimeConfig.js';

const baseEnv = {
  GUEST_DATA_MONGODB_TTL_SECONDS: 3600,
} as Env;

describe('computeGuestDataExpiresAt', () => {
  it('returns undefined when guest data TTL is disabled in effective config', () => {
    const eff: EffectiveRuntimeConfig = {
      emailVerificationRequired: false,
      guestSessionsEnabled: true,
      guestDataTtlEnabled: false,
    };
    expect(computeGuestDataExpiresAt(baseEnv, eff)).toBeUndefined();
  });

  it('returns a future Date when guest data TTL is enabled', () => {
    const eff: EffectiveRuntimeConfig = {
      emailVerificationRequired: false,
      guestSessionsEnabled: true,
      guestDataTtlEnabled: true,
    };
    const t0 = Date.now();
    const got = computeGuestDataExpiresAt(baseEnv, eff);
    expect(got).toBeInstanceOf(Date);
    expect(got!.getTime()).toBeGreaterThanOrEqual(t0 + 3600_000 - 50);
    expect(got!.getTime()).toBeLessThanOrEqual(t0 + 3600_000 + 50);
  });
});
