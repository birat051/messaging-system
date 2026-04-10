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
};
