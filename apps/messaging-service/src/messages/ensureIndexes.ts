import type { Db } from 'mongodb';
import { logger } from '../logger.js';
import { MESSAGES_COLLECTION } from './constants.js';

export async function ensureMessageIndexes(db: Db): Promise<void> {
  const col = db.collection(MESSAGES_COLLECTION);
  await col.createIndex(
    { conversationId: 1, createdAt: -1 },
    { name: 'messages_conversation_created' },
  );
  await col.createIndex({ id: 1 }, { unique: true, name: 'messages_id_unique' });
  logger.info('MongoDB messages indexes ensured');
}
