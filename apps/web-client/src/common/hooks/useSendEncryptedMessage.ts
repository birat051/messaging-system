import { useCallback } from 'react';
import { useStore } from 'react-redux';
import { ensureUserKeypairReadyForMessaging } from '../crypto/ensureMessagingKeypair';
import { encryptUtf8ToE2eeBody } from '../crypto/messageEcies';
import { fetchRecipientPublicKeyWithCache } from '../utils/fetchRecipientPublicKey';
import type { Message, SendMessageRequest } from '../realtime/socketWorkerProtocol';
import { useAppDispatch } from '@/store/hooks';
import type { RootState } from '@/store/store';
import { useAuth } from './useAuth';
import { useSocketWorkerSendMessage } from './useSocketWorkerSendMessage';

export type UseSendEncryptedMessageOptions = {
  /**
   * Required when the payload uses **`conversationId`** only (omit **`recipientUserId`**).
   * Usually the other participant’s **`userId`**.
   */
  peerUserId?: string;
};

/**
 * **`message:send`** with **ECIES** on UTF-8 **`body`** (opaque to the server).
 * Ensures the sender’s directory key exists (**`ensureUserKeypairReadyForMessaging`**) and
 * loads the recipient’s public key via **`fetchRecipientPublicKeyWithCache`** (Redux cache, else GET with retries) before encrypting.
 * **`usePrefetchRecipientPublicKey`** may warm the same GET earlier when a thread or search row is selected.
 */
export function useSendEncryptedMessage(
  options: UseSendEncryptedMessageOptions = {},
): { sendMessage: (payload: SendMessageRequest) => Promise<Message> } {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const store = useStore();
  const { sendMessage: socketSend } = useSocketWorkerSendMessage();
  const peerUserId = options.peerUserId?.trim() ?? '';

  const sendMessage = useCallback(
    async (payload: SendMessageRequest): Promise<Message> => {
      const senderId = user?.id;
      if (!senderId?.trim()) {
        throw new Error('You must be signed in to send messages.');
      }

      const bodyText = payload.body?.trim() ?? '';
      const hasMedia =
        payload.mediaKey !== undefined &&
        payload.mediaKey !== null &&
        String(payload.mediaKey).trim().length > 0;

      if (bodyText.length === 0) {
        if (!hasMedia) {
          throw new Error('Message body or mediaKey is required.');
        }
        await ensureUserKeypairReadyForMessaging(senderId, dispatch);
        return socketSend(payload);
      }

      const recipientUserId =
        payload.recipientUserId?.trim() || peerUserId || '';

      if (!recipientUserId) {
        throw new Error(
          'Encrypted messaging requires recipientUserId or peerUserId for this thread.',
        );
      }

      await ensureUserKeypairReadyForMessaging(senderId, dispatch);

      const recipientPk = await fetchRecipientPublicKeyWithCache(
        recipientUserId,
        () => store.getState() as RootState,
        dispatch,
      );

      const encryptedBody = await encryptUtf8ToE2eeBody(
        bodyText,
        recipientPk.publicKey,
      );

      return socketSend({
        ...payload,
        body: encryptedBody,
      });
    },
    [dispatch, peerUserId, socketSend, store, user?.id],
  );

  return { sendMessage };
}
