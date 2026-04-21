import { useCallback } from 'react';
import { useStore } from 'react-redux';
import {
  encryptUtf8ToHybridSendPayload,
  mergeHybridDeviceRows,
  type HybridDeviceRow,
} from '../crypto/messageHybrid';
import type { Message, SendMessageRequest } from '../realtime/socketWorkerProtocol';
import { ensureUserKeypairReadyForMessaging } from '../crypto/ensureMessagingKeypair';
import {
  fetchDevicePublicKeys,
  isDevicePublicKeysCacheFresh,
  selectDevicePublicKeysEntry,
} from '@/modules/crypto/stores/devicePublicKeysSlice';
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

/** Peer has no rows in **`GET /users/:userId/devices/public-keys`** — hybrid send is impossible. */
export const RECIPIENT_NO_HYBRID_DEVICE_KEYS_MESSAGE =
  'This contact has no registered messaging devices. They need to use the app once on a supported browser (HTTPS) so their device can register encryption keys.';

/** Signed-in user has no device rows after directory fetch — local key bootstrap failed or cache is empty. */
export const SENDER_NO_HYBRID_DEVICE_KEYS_MESSAGE =
  'No device encryption keys are available for your account in this browser. Try refreshing after signing in.';

function readFreshDeviceRows(
  state: RootState,
  userId: string,
): HybridDeviceRow[] | null {
  const e = selectDevicePublicKeysEntry(state, userId);
  return isDevicePublicKeysCacheFresh(e) ? (e?.items ?? []) : null;
}

/**
 * **`message:send`** for **direct 1:1** text — **per-device hybrid only** (no legacy **`E2EE_JSON_V1:`** / user-level
 * **`GET /users/:id/public-key`** path).
 *
 * Loads **recipient** + **sender** device rows via **`fetchDevicePublicKeys`** → **`encryptUtf8ToHybridSendPayload`**.
 * **Receive** — **`usePeerMessageDecryption`** / **`useDecryptMessage`**. Wire shape: **`e2eeOutboundSendTrace.ts`**.
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
          'Encrypted send requires recipientUserId or peerUserId for this thread.',
        );
      }

      await ensureUserKeypairReadyForMessaging(senderId, dispatch);

      const rid = recipientUserId.trim();
      const st0 = store.getState() as RootState;
      let recipientRows = readFreshDeviceRows(st0, rid);
      let selfRows = readFreshDeviceRows(st0, 'me');

      if (recipientRows === null || selfRows === null) {
        await Promise.all([
          recipientRows === null
            ? dispatch(fetchDevicePublicKeys(rid)).unwrap()
            : Promise.resolve(),
          selfRows === null
            ? dispatch(fetchDevicePublicKeys('me')).unwrap()
            : Promise.resolve(),
        ]);
      }

      const st = store.getState() as RootState;
      const rEntry = selectDevicePublicKeysEntry(st, rid);
      const sEntry = selectDevicePublicKeysEntry(st, 'me');
      if (rEntry?.status === 'failed' || sEntry?.status === 'failed') {
        throw new Error(
          rEntry?.error ?? sEntry?.error ?? 'Failed to load device public keys.',
        );
      }

      const finalRecipientRows = rEntry?.items ?? [];
      const finalSelfRows = sEntry?.items ?? [];

      if (finalRecipientRows.length === 0) {
        throw new Error(RECIPIENT_NO_HYBRID_DEVICE_KEYS_MESSAGE);
      }
      if (finalSelfRows.length === 0) {
        throw new Error(SENDER_NO_HYBRID_DEVICE_KEYS_MESSAGE);
      }

      const devices = mergeHybridDeviceRows(finalRecipientRows, finalSelfRows);
      const hybrid = await encryptUtf8ToHybridSendPayload(bodyText, devices);

      return socketSend({
        ...payload,
        body: hybrid.body,
        iv: hybrid.iv,
        encryptedMessageKeys: hybrid.encryptedMessageKeys,
        algorithm: hybrid.algorithm,
      });
    },
    [dispatch, peerUserId, socketSend, store, user?.id],
  );

  return { sendMessage };
}
