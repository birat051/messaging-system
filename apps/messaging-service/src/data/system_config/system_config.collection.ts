import type { Db } from 'mongodb';
import { logger } from '../../utils/logger.js';

/** MongoDB collection name — singleton product toggles (ops can change without redeploy). */
export const SYSTEM_CONFIG_COLLECTION = 'system_config';

export const SYSTEM_CONFIG_DOCUMENT_ID = 'singleton' as const;

/**
 * Singleton document shape — **`_id`** is the fixed **`SYSTEM_CONFIG_DOCUMENT_ID`** string.
 * Merged with env defaults at runtime; see **`getEffectiveRuntimeConfig`** in **`config/runtimeConfig.ts`**.
 */
export type SystemConfigDocument = {
  _id: typeof SYSTEM_CONFIG_DOCUMENT_ID;
  /** When set, overrides **`EMAIL_VERIFICATION_REQUIRED`** env for runtime decisions. */
  emailVerificationRequired?: boolean;
  /** When set, overrides **`GUEST_SESSIONS_ENABLED`** env. Reserved for **`POST /auth/guest`**. */
  guestSessionsEnabled?: boolean;
  updatedAt?: Date;
};

/**
 * **`system_config`** — relies on MongoDB’s default unique **`_id`** index for the singleton document.
 * No application-defined secondary indexes.
 */
export async function ensureSystemConfigIndexes(db: Db): Promise<void> {
  void db;
  logger.info('MongoDB system_config: using default _id index only');
}
