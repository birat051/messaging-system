import { logAttachmentE2ee } from '@/common/crypto/attachmentE2eeDebug';
import type { Message } from './socketWorkerProtocol';

/**
 * **`encryptedMessageKeys`** on **`message:new`** — same shape as REST / **`Message`**.
 */
function parseEncryptedMessageKeysField(
  raw: unknown,
): Record<string, string> | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      return undefined;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Validates a **`message:new`** Socket.IO payload (flat **`Message`**, same as REST).
 *
 * **Hybrid E2EE (`iv`, `algorithm`, `encryptedMessageKeys`)** must be preserved so
 * **`usePeerMessageDecryption`** can unwrap **`body`** and recover **`m.k`** when **`mediaKey`** is null.
 */
export function parseMessageNewPayload(input: unknown): Message | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.trim() === '') return null;
  if (typeof o.conversationId !== 'string' || o.conversationId.trim() === '') return null;
  if (typeof o.senderId !== 'string' || o.senderId.trim() === '') return null;
  if (typeof o.createdAt !== 'string' || o.createdAt.trim() === '') return null;
  if (o.body !== undefined && o.body !== null && typeof o.body !== 'string') return null;
  if (o.mediaKey !== undefined && o.mediaKey !== null && typeof o.mediaKey !== 'string') return null;
  if (o.iv !== undefined && o.iv !== null && typeof o.iv !== 'string') return null;
  if (o.algorithm !== undefined && o.algorithm !== null && typeof o.algorithm !== 'string') {
    return null;
  }

  const emk = parseEncryptedMessageKeysField(o.encryptedMessageKeys);
  if (emk === undefined && o.encryptedMessageKeys !== undefined) {
    return null;
  }

  const message: Message = {
    id: o.id.trim(),
    conversationId: o.conversationId.trim(),
    senderId: o.senderId.trim(),
    createdAt: o.createdAt,
  };
  if (o.body !== undefined) message.body = o.body === null ? null : o.body;
  if (o.mediaKey !== undefined) message.mediaKey = o.mediaKey === null ? null : o.mediaKey;
  if (o.iv !== undefined) message.iv = o.iv === null ? null : o.iv;
  if (o.algorithm !== undefined) {
    message.algorithm = o.algorithm === null ? null : o.algorithm;
  }
  if (emk !== undefined) {
    message.encryptedMessageKeys = emk;
  }
  logAttachmentE2ee('message:new parse (Socket.IO)', {
    id: message.id,
    conversationId: message.conversationId,
    hasBody: Boolean(message.body?.trim()),
    wireMediaKey: message.mediaKey ?? null,
    hasIv: message.iv != null && message.iv !== '',
    algorithm: message.algorithm ?? null,
    encryptedMessageKeyCount: message.encryptedMessageKeys
      ? Object.keys(message.encryptedMessageKeys).length
      : 0,
  });
  return message;
}
