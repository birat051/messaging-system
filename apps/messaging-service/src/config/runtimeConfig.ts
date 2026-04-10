import type { Db } from 'mongodb';
import type { Env } from './env.js';
import { getDb } from '../db/mongo.js';
import { getRedisClient } from '../redis/redis.js';
import { logger } from '../logger.js';

/** Singleton document in **`system_config`** — product toggles (ops can change without redeploy). */
export const SYSTEM_CONFIG_COLLECTION = 'system_config';

export const SYSTEM_CONFIG_DOCUMENT_ID = 'singleton' as const;

/** Redis cache key for merged effective runtime config (JSON). */
export const RUNTIME_CONFIG_REDIS_KEY = 'messaging:runtime_config:effective';

/** TTL for Redis cache — **5 minutes**; after expiry the next read refetches MongoDB + env merge. */
export const RUNTIME_CONFIG_REDIS_TTL_SECONDS = 300;

export type SystemConfigDocument = {
  _id: typeof SYSTEM_CONFIG_DOCUMENT_ID;
  /** When set, overrides **`EMAIL_VERIFICATION_REQUIRED`** env for runtime decisions. */
  emailVerificationRequired?: boolean;
  /** When set, overrides **`GUEST_SESSIONS_ENABLED`** env. Reserved for **`POST /auth/guest`**. */
  guestSessionsEnabled?: boolean;
  updatedAt?: Date;
};

export type EffectiveRuntimeConfig = {
  emailVerificationRequired: boolean;
  guestSessionsEnabled: boolean;
};

/**
 * Merge **`system_config`** singleton with **env** defaults (Mongo field missing → env).
 * Does **not** insert a Mongo document — first boot uses env only until ops seed **`system_config`**.
 */
export async function buildEffectiveRuntimeConfigFromDb(
  db: Db,
  env: Env,
): Promise<EffectiveRuntimeConfig> {
  const col = db.collection<SystemConfigDocument>(SYSTEM_CONFIG_COLLECTION);
  const doc = await col.findOne({ _id: SYSTEM_CONFIG_DOCUMENT_ID });

  const emailVerificationRequired =
    typeof doc?.emailVerificationRequired === 'boolean'
      ? doc.emailVerificationRequired
      : env.EMAIL_VERIFICATION_REQUIRED;

  const guestSessionsEnabled =
    typeof doc?.guestSessionsEnabled === 'boolean'
      ? doc.guestSessionsEnabled
      : env.GUEST_SESSIONS_ENABLED;

  return {
    emailVerificationRequired,
    guestSessionsEnabled,
  };
}

function parseCachedJson(raw: string): EffectiveRuntimeConfig | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'emailVerificationRequired' in parsed &&
      'guestSessionsEnabled' in parsed &&
      typeof (parsed as EffectiveRuntimeConfig).emailVerificationRequired ===
        'boolean' &&
      typeof (parsed as EffectiveRuntimeConfig).guestSessionsEnabled === 'boolean'
    ) {
      return parsed as EffectiveRuntimeConfig;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * **Redis first** (TTL **{@link RUNTIME_CONFIG_REDIS_TTL_SECONDS}** s) → on miss, **MongoDB** + env merge,
 * then **SET** Redis. If Redis read/write fails, still returns DB/env merge (degraded, no cache).
 */
export async function getEffectiveRuntimeConfig(env: Env): Promise<EffectiveRuntimeConfig> {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    logger.warn(
      'Redis unavailable for runtime config cache; using MongoDB + env only',
    );
    return buildEffectiveRuntimeConfigFromDb(getDb(), env);
  }

  try {
    const raw = await redis.get(RUNTIME_CONFIG_REDIS_KEY);
    if (raw) {
      const hit = parseCachedJson(raw);
      if (hit) {
        return hit;
      }
    }
  } catch (err: unknown) {
    logger.warn({ err }, 'runtime config Redis GET failed; loading from MongoDB');
  }

  const effective = await buildEffectiveRuntimeConfigFromDb(getDb(), env);

  try {
    await redis.set(RUNTIME_CONFIG_REDIS_KEY, JSON.stringify(effective), {
      EX: RUNTIME_CONFIG_REDIS_TTL_SECONDS,
    });
  } catch (err: unknown) {
    logger.warn({ err }, 'runtime config Redis SET failed; response not cached');
  }

  return effective;
}
