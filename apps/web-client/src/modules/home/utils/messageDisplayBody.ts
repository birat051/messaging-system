import { isE2eeEnvelopeBody } from '@/common/crypto/messageEcies';
import type { Message } from '@/modules/home/stores/messagingSlice';

/**
 * Resolves **UI** text for a **`Message.body`**: plaintext for non-E2EE; for E2EE, uses client overlays
 * (**sender** plaintext cache, **recipient** decrypted cache) so the wire ciphertext is never shown.
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
  if (!isE2eeEnvelopeBody(raw)) {
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
