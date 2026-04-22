import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useSendEncryptedMessage } from '@/common/hooks/useSendEncryptedMessage';
import { useAuth } from '@/common/hooks/useAuth';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { bumpConversationInListCache } from '@/modules/home/utils/conversationListCache';
import type { StoredMessage } from '@/modules/home/stores/messagingSlice';
import {
  appendMessageFromSend,
  removeOptimisticMessage,
  replaceOptimisticMessage,
  setSendError,
  setSendPending,
} from '@/modules/home/stores/messagingSlice';
import type { ThreadComposerSendPayload } from '@/modules/home/types/ThreadComposer-types';
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

  const sendMessage = useCallback(
    async (payload: ThreadComposerSendPayload) => {
      if (!conversationId?.trim() || !user?.id) {
        throw new Error('Not signed in');
      }
      const cid = conversationId.trim();
      const text = payload.text.trim();
      const mediaKey = payload.mediaKey?.trim() ?? null;
      const mediaPreviewUrl = payload.mediaPreviewUrl?.trim() ?? null;
      const mediaRetrievableUrl = payload.mediaRetrievableUrl?.trim() ?? null;
      if (!text && !mediaKey) {
        throw new Error('Message body or attachment is required.');
      }

      const optimisticId = newOptimisticId();
      const optimisticMessage: StoredMessage = {
        id: optimisticId,
        conversationId: cid,
        senderId: user.id,
        body: text.length > 0 ? text : null,
        mediaKey,
        createdAt: new Date().toISOString(),
        ...(mediaPreviewUrl ? { mediaPreviewUrl } : {}),
      };

      dispatch(appendMessageFromSend({ conversationId: cid, message: optimisticMessage }));
      dispatch(setSendPending({ conversationId: cid, pending: true }));
      dispatch(setSendError({ conversationId: cid, error: null }));
      bumpConversationInListCache(mutate, user.id, cid, optimisticMessage.createdAt);

      try {
        const serverMessage = await sendEncrypted({
          conversationId: cid,
          body: text.length > 0 ? text : undefined,
          mediaKey: mediaKey ?? undefined,
          ...(mediaRetrievableUrl ? { mediaRetrievableUrl } : {}),
        });
        dispatch(
          replaceOptimisticMessage({
            conversationId: cid,
            optimisticId,
            message: serverMessage,
          }),
        );
        bumpConversationInListCache(mutate, user.id, cid, serverMessage.createdAt);
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

  return { sendMessage };
}
