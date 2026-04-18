import type { Db } from 'mongodb';
import { logger } from '../../utils/logger.js';

/** MongoDB collection name. */
export const CONVERSATIONS_COLLECTION = 'conversations';

/**
 * Direct 1:1 thread — **`directPairKey`** is **`min(userId)|max(userId)`** for stable lookup.
 * Group conversations will use a different shape when implemented.
 */
export type DirectConversationDocument = {
  id: string;
  directPairKey: string;
  participantIds: [string, string];
  isGroup: false;
  createdAt: Date;
  updatedAt: Date;
  /** Guest-only guest↔guest threads — MongoDB TTL when **`guestDataTtlEnabled`** is on. */
  guestDataExpiresAt?: Date;
};

/**
 * **`conversations`** collection — indexes follow ****`docs/PROJECT_PLAN.md` §14**** (access-pattern-first).
 *
 * | Access pattern | Query shape | Index |
 * |----------------|-------------|--------|
 * | Resolve thread by id (send, membership check) | `findOne({ id })` | `conversations_id_unique` |
 * | Find existing **direct** 1:1 by stable pair key | `findOne({ directPairKey, isGroup: false })` | `conversations_directpair_unique` (partial) |
 * | List threads for a user, newest activity first (**`GET /conversations`**) | `find({ participantIds: userId }).sort({ updatedAt: -1, id: -1 })` | `conversations_participants_updated` |
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
  await col.createIndex(
    { participantIds: 1, updatedAt: -1, id: -1 },
    { name: 'conversations_participants_updated' },
  );
  await col.createIndex(
    { guestDataExpiresAt: 1 },
    {
      name: 'conversations_guest_data_ttl',
      expireAfterSeconds: 0,
      sparse: true,
    },
  );
  logger.info('MongoDB conversations indexes ensured');
}
