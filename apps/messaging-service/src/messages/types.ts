export type MessageDocument = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  mediaKey: string | null;
  createdAt: Date;
};
