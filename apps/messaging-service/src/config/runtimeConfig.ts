import type { Db } from 'mongodb';
import type { Env } from './env.js';
import {
  SYSTEM_CONFIG_COLLECTION,
  SYSTEM_CONFIG_DOCUMENT_ID,
  type SystemConfigDocument,
} from '../data/system_config/system_config.collection.js';
import { getDb } from '../data/db/mongo.js';
import { getRedisClient } from '../data/redis/redis.js';
import { logger } from '../utils/logger.js';

export {
  SYSTEM_CONFIG_COLLECTION,
  SYSTEM_CONFIG_DOCUMENT_ID,
  type SystemConfigDocument,
};

/** Redis cache key for merged effective runtime config (JSON). */
export const RUNTIME_CONFIG_REDIS_KEY = 'messaging:runtime_config:effective';

/** TTL for Redis cache — **5 minutes**; after expiry the next read refetches MongoDB + env merge. */
export const RUNTIME_CONFIG_REDIS_TTL_SECONDS = 300;

export type EffectiveRuntimeConfig = {
  emailVerificationRequired: boolean;
  guestSessionsEnabled: boolean;
  /** MongoDB TTL for guest **`guestDataExpiresAt`** fields — default **`true`**. */
  guestDataTtlEnabled: boolean;
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

  const guestDataTtlEnabled =
    typeof doc?.guestDataTtlEnabled === 'boolean'
      ? doc.guestDataTtlEnabled
      : env.GUEST_DATA_TTL_ENABLED;

  return {
    emailVerificationRequired,
    guestSessionsEnabled,
    guestDataTtlEnabled,
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
      'guestDataTtlEnabled' in parsed &&
      typeof (parsed as EffectiveRuntimeConfig).emailVerificationRequired ===
        'boolean' &&
      typeof (parsed as EffectiveRuntimeConfig).guestSessionsEnabled === 'boolean' &&
      typeof (parsed as EffectiveRuntimeConfig).guestDataTtlEnabled === 'boolean'
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
