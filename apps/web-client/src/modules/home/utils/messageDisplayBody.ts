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
 * **Own E2EE rows:** use **`senderPlaintextByMessageId[m.id]`**; if missing, show **`…`** (never the wire
 * envelope from MongoDB) until the send-ack path populates the map. See
 * **`docs/PROJECT_PLAN.md`** §7.1 §4.
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
    const o = senderPlaintextByMessageId[m.id];
    if (o !== undefined) {
      return o;
    }
    return '\u2026';
  }
  const d = decryptedBodyByMessageId[m.id];
  if (d !== undefined) {
    return d;
  }
  return '\u2026';
}
