import type { Db } from 'mongodb';
import { logger } from '../logger.js';
import { CONVERSATIONS_COLLECTION } from './constants.js';

/**
 * Idempotent indexes for direct 1:1 lookups by **`directPairKey`**.
 */
export async function ensureConversationIndexes(db: Db): Promise<void> {
  const col = db.collection(CONVERSATIONS_COLLECTION);
  await col.createIndex(
    { id: 1 },
    { unique: true, name: 'conversations_id_unique' },
  );
  await col.createIndex(
    { directPairKey: 1 },
    {
      unique: true,
      name: 'conversations_directpair_unique',
      partialFilterExpression: { isGroup: false, directPairKey: { $exists: true } },
    },
  );
  logger.info('MongoDB conversations indexes ensured');
}
