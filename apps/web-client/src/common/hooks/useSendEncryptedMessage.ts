import { useCallback } from 'react';
import { getUserPublicKeyById } from '../api/usersApi';
import { ensureUserKeypairReadyForMessaging } from '../crypto/ensureMessagingKeypair';
import { encryptUtf8ToE2eeBody } from '../crypto/messageEcies';
import { parseApiError } from '@/modules/auth/utils/apiError';
import type { Message, SendMessageRequest } from '../realtime/socketWorkerProtocol';
import { useAppDispatch } from '@/store/hooks';
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
 * Ensures the sender’s directory key exists (**automatic** generate + register + local keyring) and
 * fetches the recipient’s public key before encrypting.
 */
export function useSendEncryptedMessage(
  options: UseSendEncryptedMessageOptions = {},
): { sendMessage: (payload: SendMessageRequest) => Promise<Message> } {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
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

      let recipientPk: Awaited<ReturnType<typeof getUserPublicKeyById>>;
      try {
        recipientPk = await getUserPublicKeyById(recipientUserId);
      } catch (e) {
        const p = parseApiError(e);
        if (p.httpStatus === 404) {
          throw new Error(
            'The recipient has not registered an encryption key yet. They must use the app on a secure context so a key can be created.',
          );
        }
        throw e;
      }

      const encryptedBody = await encryptUtf8ToE2eeBody(
        bodyText,
        recipientPk.publicKey,
      );

      return socketSend({
        ...payload,
        body: encryptedBody,
      });
    },
    [dispatch, peerUserId, socketSend, user?.id],
  );

  return { sendMessage };
}
