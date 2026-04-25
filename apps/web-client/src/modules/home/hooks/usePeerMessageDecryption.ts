import { useEffect } from 'react';
import { useStore } from 'react-redux';
import { parseDecryptedHybridUtf8 } from '@/common/crypto/messageHybridPlaintext';
import {
  decryptHybridMessageToUtf8,
  isHybridE2eeMessage,
} from '@/common/crypto/messageHybrid';
import { getStoredDeviceId } from '@/common/crypto/privateKeyStorage';
import { loadMessagingEcdhPrivateKey } from '@/common/crypto/loadMessagingEcdhPrivateKey';
import { setPeerDecryptedBody } from '@/modules/home/stores/messagingSlice';
import type { Message } from '@/modules/home/stores/messagingSlice';
import {
  PEER_DECRYPT_CRYPTO_FAILED,
  PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
  PEER_DECRYPT_NO_LOCAL_KEY,
} from '@/modules/home/utils/peerDecryptInline';
import { shouldRetryPeerDecryptAfterCachedFailure } from '@/modules/home/utils/peerDecryptRetry';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store/store';

const DEBUG_PEER_DECRYPT =
  import.meta.env.DEV &&
  import.meta.env.VITE_DEBUG_PEER_DECRYPT === 'true';

function debugPeerDecrypt(message: string, details: Record<string, unknown>): void {
  if (!DEBUG_PEER_DECRYPT) {
    return;
  }
  console.debug(`[peer-decrypt] ${message}`, details);
}

/**
 * Hybrid decrypt for the active thread: **peer** rows and **own** rows sent from **another** browser/device
 * (no **`senderPlaintextByMessageId`** on this tab). Stores UTF-8 in **`decryptedBodyByMessageId`** — see
 * **`resolveMessageDisplayBody`** (own rows fall back to this map after sender plaintext).
 *
 * **Multi-device:** when **`message:new`** / REST adds **`encryptedMessageKeys[myDeviceId]`**, decrypt runs;
 * missing entry → **`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`** until sync adds a wrapped key.
 *
 * **Trace:** `e2eeInboundDecryptTrace.ts`, **`e2eeReceiveTrace.ts`**. **Dev logs:** **`VITE_DEBUG_PEER_DECRYPT=true`**
 * (hook branches); **`VITE_DEBUG_HYBRID_DECRYPT=true`** (per-message **`decryptHybridMessageToUtf8`** phases + key fingerprint).
 */
export function usePeerMessageDecryption(
  conversationId: string | null,
  messageIds: readonly string[],
): void {
  const dispatch = useAppDispatch();
  const store = useStore();
  const userId = useAppSelector((s) => s.auth.user?.id ?? null);
  const cryptoDeviceId = useAppSelector((s) => s.crypto.deviceId);
  const idsKey = messageIds.join(',');
  /** Changes when peer hybrid wire shape updates (e.g. REST hydrate) even if **`idsKey`** is unchanged. */
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
      const emk = m.encryptedMessageKeys
        ? Object.keys(m.encryptedMessageKeys).sort().join(',')
        : '';
      acc += `${mid}:${m.body ?? ''}|${m.iv ?? ''}|${m.algorithm ?? ''}|${emk}|`;
    }
    return acc;
  });

  /** Own hybrid echoes from **other** devices — re-run when **`encryptedMessageKeys`** / body arrives. */
  const ownHybridEchoSig = useAppSelector((s) => {
    const uid = s.auth.user?.id?.trim();
    if (!uid) {
      return '';
    }
    let acc = '';
    const mids = idsKey.length === 0 ? [] : idsKey.split(',');
    for (const mid of mids) {
      const m = s.messaging.messagesById[mid];
      if (!m || m.senderId !== uid) {
        continue;
      }
      if (!isHybridE2eeMessage(m)) {
        continue;
      }
      if (s.messaging.senderPlaintextByMessageId[mid] !== undefined) {
        continue;
      }
      const emk = m.encryptedMessageKeys
        ? Object.keys(m.encryptedMessageKeys).sort().join(',')
        : '';
      acc += `${mid}:${m.body ?? ''}|${m.iv ?? ''}|${m.algorithm ?? ''}|${emk}|`;
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
      const messaging = (store.getState() as RootState).messaging;
      const { messagesById, decryptedBodyByMessageId, senderPlaintextByMessageId } =
        messaging;
      const targets: Message[] = [];
      for (const mid of midList) {
        const m: Message | undefined = messagesById[mid];
        if (!m || !isHybridE2eeMessage(m)) {
          continue;
        }
        const cached = decryptedBodyByMessageId[mid];
        if (!shouldRetryPeerDecryptAfterCachedFailure(cached)) {
          continue;
        }

        const isOwnRow = m.senderId === uid;
        if (isOwnRow) {
          if (senderPlaintextByMessageId[mid] !== undefined) {
            continue;
          }
          targets.push(m);
          continue;
        }

        targets.push(m);
      }

      if (targets.length === 0 || cancelled) {
        return;
      }

      const pk = await loadMessagingEcdhPrivateKey(uid);
      if (!pk) {
        if (!cancelled) {
          debugPeerDecrypt('no local ECDH key — decryptMessageBody not reached', {
            messageIds: targets.map((t) => t.id),
          });
          for (const t of targets) {
            dispatch(
              setPeerDecryptedBody({
                messageId: t.id,
                plaintext: PEER_DECRYPT_NO_LOCAL_KEY,
              }),
            );
          }
        }
        return;
      }

      const deviceId = await getStoredDeviceId(uid);

      for (const m of targets) {
        if (cancelled) {
          break;
        }
        try {
          if (
            !deviceId?.trim() ||
            !m.encryptedMessageKeys?.[deviceId.trim()]
          ) {
            debugPeerDecrypt('hybrid: missing deviceId or encryptedMessageKeys[deviceId] — decryptMessageBody skipped', {
              messageId: m.id,
              hasDeviceId: Boolean(deviceId?.trim()),
              keyIds: m.encryptedMessageKeys
                ? Object.keys(m.encryptedMessageKeys)
                : [],
            });
            dispatch(
              setPeerDecryptedBody({
                messageId: m.id,
                plaintext: PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
              }),
            );
            continue;
          }
          debugPeerDecrypt(
            m.senderId === uid
              ? 'hybrid own-echo (other device): unwrap + decryptMessageBody'
              : 'hybrid peer: unwrap + decryptMessageBody',
            {
              messageId: m.id,
              deviceId: deviceId.trim(),
            },
          );
          const pt = await decryptHybridMessageToUtf8(
            {
              body: m.body!,
              iv: m.iv!,
              encryptedMessageKeys: m.encryptedMessageKeys!,
            },
            deviceId.trim(),
            pk,
            {
              messageId: m.id,
              conversationId: conversationId ?? undefined,
            },
          );
          const parsed = parseDecryptedHybridUtf8(pt);
          if (!cancelled) {
            const url = parsed.mediaRetrievableUrl?.trim() ?? '';
            dispatch(
              setPeerDecryptedBody({
                messageId: m.id,
                plaintext: parsed.text,
                resolvedAttachmentKey: parsed.mediaObjectKey ?? undefined,
                ...(url.length > 0 ? { resolvedAttachmentUrl: url } : {}),
              }),
            );
          }
        } catch (err) {
          debugPeerDecrypt('unwrap or decryptMessageBody threw', {
            messageId: m.id,
            err: err instanceof Error ? err.message : String(err),
          });
          if (!cancelled) {
            dispatch(
              setPeerDecryptedBody({
                messageId: m.id,
                plaintext: PEER_DECRYPT_CRYPTO_FAILED,
              }),
            );
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    userId,
    idsKey,
    peerInboundSig,
    ownHybridEchoSig,
    cryptoDeviceId,
    store,
    dispatch,
  ]);
}
