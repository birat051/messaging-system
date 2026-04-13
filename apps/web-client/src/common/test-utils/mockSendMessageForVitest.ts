import type { components } from '@/generated/api-types';
import { defaultMockUser } from '@/common/mocks/handlers';

type SendMessageRequest = components['schemas']['SendMessageRequest'];
type Message = components['schemas']['Message'];

/**
 * Simulates a successful **`message:send`** ack (**`Message`**) without HTTP or Socket.IO — for Vitest only.
 * Mirrors the former **`handlers`** `POST /v1/messages` behaviour so Composer integration tests stay aligned with **`SendMessageRequest`** → **`Message`**.
 */
export async function mockSendMessageSocketLike(
  payload: SendMessageRequest,
): Promise<Message> {
  if (payload.conversationId?.trim()) {
    return {
      id: `msg-${Date.now()}`,
      conversationId: payload.conversationId.trim(),
      senderId: defaultMockUser.id,
      body: payload.body ?? null,
      mediaKey: payload.mediaKey ?? null,
      createdAt: new Date().toISOString(),
    };
  }
  if (!payload.recipientUserId?.trim()) {
    throw new Error('recipientUserId required for new direct thread');
  }
  return {
    id: `msg-${Date.now()}`,
    conversationId: `conv-${payload.recipientUserId}-thread`,
    senderId: defaultMockUser.id,
    body: payload.body ?? null,
    mediaKey: payload.mediaKey ?? null,
    createdAt: new Date().toISOString(),
  };
}
