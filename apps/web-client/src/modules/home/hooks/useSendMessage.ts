import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useSendEncryptedMessage } from '@/common/hooks/useSendEncryptedMessage';
import { useAuth } from '@/common/hooks/useAuth';
import { parseApiError } from '@/modules/auth/utils/apiError';
import type { Message } from '@/modules/home/stores/messagingSlice';
import {
  appendMessageFromSend,
  removeOptimisticMessage,
  replaceOptimisticMessage,
  setSendError,
  setSendPending,
} from '@/modules/home/stores/messagingSlice';
import { useAppDispatch } from '@/store/hooks';

function newOptimisticId(): string {
  return `client:${globalThis.crypto.randomUUID()}`;
}

export type UseSendMessageOptions = {
  conversationId: string | null;
  peerUserId?: string | null;
};

/**
 * **Primary** send path: **`message:send`** via **`useSendEncryptedMessage`** (**Socket.IO** in the worker),
 * not **`POST /messages`**. Inserts an **optimistic** row, then **reconciles** with the server ack and **SWR** revalidation.
 */
export function useSendMessage(options: UseSendMessageOptions) {
  const { conversationId, peerUserId } = options;
  const dispatch = useAppDispatch();
  const { mutate } = useSWRConfig();
  const { user } = useAuth();
  const { sendMessage: sendEncrypted } = useSendEncryptedMessage({
    peerUserId: peerUserId ?? undefined,
  });

  const sendText = useCallback(
    async (text: string) => {
      if (!conversationId?.trim() || !user?.id) {
        throw new Error('Not signed in');
      }
      const cid = conversationId.trim();
      const optimisticId = newOptimisticId();
      const optimisticMessage: Message = {
        id: optimisticId,
        conversationId: cid,
        senderId: user.id,
        body: text,
        mediaKey: null,
        createdAt: new Date().toISOString(),
      };

      dispatch(appendMessageFromSend({ conversationId: cid, message: optimisticMessage }));
      dispatch(setSendPending({ conversationId: cid, pending: true }));
      dispatch(setSendError({ conversationId: cid, error: null }));

      try {
        const serverMessage = await sendEncrypted({
          conversationId: cid,
          body: text,
        });
        dispatch(
          replaceOptimisticMessage({
            conversationId: cid,
            optimisticId,
            message: serverMessage,
          }),
        );
        await mutate(['conversation-messages', cid, user.id]);
      } catch (e: unknown) {
        dispatch(removeOptimisticMessage({ conversationId: cid, clientId: optimisticId }));
        const msg = parseApiError(e).message;
        dispatch(setSendError({ conversationId: cid, error: msg }));
        throw new Error(msg);
      } finally {
        dispatch(setSendPending({ conversationId: cid, pending: false }));
      }
    },
    [conversationId, dispatch, mutate, sendEncrypted, user?.id],
  );

  return { sendText };
}
