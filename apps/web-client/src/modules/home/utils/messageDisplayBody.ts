import { isMessageWireE2ee } from '@/common/crypto/messageHybrid';
import { looksLikeOpaqueCiphertextBody } from '@/modules/home/utils/messageBodyOpaqueHeuristic';
import { PEER_DECRYPT_INLINE_UNAVAILABLE } from '@/modules/home/utils/peerDecryptInline';
import type { Message } from '@/modules/home/stores/messagingSlice';

const DEBUG_MESSAGE_DISPLAY =
  import.meta.env.DEV &&
  import.meta.env.VITE_DEBUG_MESSAGE_DISPLAY === 'true';

function debugMessageDisplay(
  message: string,
  details: Record<string, unknown>,
): void {
  if (!DEBUG_MESSAGE_DISPLAY) {
    return;
  }
  // eslint-disable-next-line no-console -- gated by VITE_DEBUG_MESSAGE_DISPLAY
  console.debug(`[message-display] ${message}`, details);
}

/**
 * Resolves **UI** text for a **`Message.body`**: plaintext for non-E2EE; for E2EE, uses client overlays
 * (**sender** plaintext cache, **recipient** decrypted cache) so classified wire ciphertext is not shown.
 *
 * **Unclassified opaque `body`:** when **`!isMessageWireE2ee(m)`** but **`body`** looks like base64-ish
 * ciphertext, the bubble shows **Feature 11 (B)** **`PEER_DECRYPT_INLINE_UNAVAILABLE`** (peer) or **`…`**
 * (own) — never raw blobs. See **`e2eeInboundDecryptTrace.ts`**.
 *
 * **Own E2EE rows:** **`senderPlaintextByMessageId`** from this tab’s send path; if missing (message sent from
 * another device / session), **`decryptedBodyByMessageId`** after **`usePeerMessageDecryption`** hybrid-unwrapped the
 * echo using **`encryptedMessageKeys[thisDeviceId]`**. Else **`…`** — never raw wire **`body`**.
 */
export function resolveMessageDisplayBody(
  m: Message,
  isOwn: boolean,
  senderPlaintextByMessageId: Record<string, string>,
  decryptedBodyByMessageId: Record<string, string>,
): string {
  const raw = m.body ?? '';
  if (!raw) {
    return '';
  }
  if (!isMessageWireE2ee(m)) {
    if (looksLikeOpaqueCiphertextBody(raw)) {
      debugMessageDisplay('suppressed unclassified opaque body', {
        messageId: m.id,
        isOwn,
      });
      return isOwn ? '\u2026' : PEER_DECRYPT_INLINE_UNAVAILABLE;
    }
    return raw;
  }
  if (isOwn) {
    const sender = senderPlaintextByMessageId[m.id];
    if (sender !== undefined) {
      return sender;
    }
    const echoed = decryptedBodyByMessageId[m.id];
    if (echoed !== undefined) {
      return echoed;
    }
    return '\u2026';
  }
  const d = decryptedBodyByMessageId[m.id];
  if (d !== undefined) {
    return d;
  }
  return '\u2026';
}
