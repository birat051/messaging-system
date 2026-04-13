import { useEffect } from 'react';
import { useStore } from 'react-redux';
import { decryptE2eeBodyToUtf8, isE2eeEnvelopeBody } from '@/common/crypto/messageEcies';
import { loadMessagingEcdhPrivateKey } from '@/common/crypto/loadMessagingEcdhPrivateKey';
import { setPeerDecryptedBody } from '@/modules/home/stores/messagingSlice';
import type { Message } from '@/modules/home/stores/messagingSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store/store';

const NO_KEY_MSG =
  'Could not decrypt this message. Your encryption key is not available on this device.';
const DECRYPT_FAIL_MSG = 'Could not decrypt this message.';

/**
 * Decrypts **inbound** E2EE bodies for the active thread using the local ECDH private key
 * and stores plaintext in **`decryptedBodyByMessageId`** for **`resolveMessageDisplayBody`**.
 */
export function usePeerMessageDecryption(
  conversationId: string | null,
  messageIds: readonly string[],
): void {
  const dispatch = useAppDispatch();
  const store = useStore();
  const userId = useAppSelector((s) => s.auth.user?.id ?? null);
  const idsKey = messageIds.join(',');
  /** Changes when peer message bodies load (e.g. REST hydrate) even if **`idsKey`** is unchanged. */
  const peerInboundSig = useAppSelector((s) => {
    const uid = s.auth.user?.id;
    if (!uid) {
      return '';
    }
    let acc = '';
    const mids = idsKey.length === 0 ? [] : idsKey.split(',');
    for (const mid of mids) {
      const m = s.messaging.messagesById[mid];
      if (!m || m.senderId === uid) {
        continue;
      }
      acc += `${mid}:${m.body ?? ''}|`;
    }
    return acc;
  });

  useEffect(() => {
    if (!conversationId?.trim() || !userId?.trim()) {
      return;
    }
    const uid = userId.trim();
    const midList = idsKey.length === 0 ? [] : idsKey.split(',');

    let cancelled = false;

    void (async () => {
      const { messagesById, decryptedBodyByMessageId } = (store.getState() as RootState)
        .messaging;
      const targets: { id: string; body: string }[] = [];
      for (const mid of midList) {
        const m: Message | undefined = messagesById[mid];
        if (!m || m.senderId === uid) {
          continue;
        }
        const raw = m.body ?? '';
        if (!isE2eeEnvelopeBody(raw)) {
          continue;
        }
        if (decryptedBodyByMessageId[mid] !== undefined) {
          continue;
        }
        targets.push({ id: mid, body: raw });
      }

      if (targets.length === 0 || cancelled) {
        return;
      }

      const pk = await loadMessagingEcdhPrivateKey(uid);
      if (!pk) {
        if (!cancelled) {
          for (const t of targets) {
            dispatch(
              setPeerDecryptedBody({ messageId: t.id, plaintext: NO_KEY_MSG }),
            );
          }
        }
        return;
      }

      for (const t of targets) {
        if (cancelled) {
          break;
        }
        try {
          const pt = await decryptE2eeBodyToUtf8(t.body, pk);
          if (!cancelled) {
            dispatch(setPeerDecryptedBody({ messageId: t.id, plaintext: pt }));
          }
        } catch {
          if (!cancelled) {
            dispatch(
              setPeerDecryptedBody({ messageId: t.id, plaintext: DECRYPT_FAIL_MSG }),
            );
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, userId, idsKey, peerInboundSig, store, dispatch]);
}
