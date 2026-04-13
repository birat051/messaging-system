import type { Message } from '@/modules/home/stores/messagingSlice';
import { resolveMessageDisplayBody } from './messageDisplayBody';

/**
 * **1–2 characters** for the conversation list avatar circle (no profile URL in **`GET /conversations`** yet).
 */
export function conversationListAvatarInitials(title: string): string {
  const t = title.trim();
  if (!t) {
    return '?';
  }
  const lower = t.toLowerCase();
  if (lower === 'direct message') {
    return 'DM';
  }
  if (lower === 'group') {
    return 'G';
  }
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]![0];
    const b = parts[1]![0];
    if (a && b) {
      return `${a}${b}`.toUpperCase();
    }
  }
  return t.slice(0, 2).toUpperCase();
}

/**
 * Text for the list **second line** — last message preview when **`body` / overlays** exist, else **Attachment** when **`mediaKey`** only.
 */
export function lastMessagePreviewLine(
  m: Message,
  userId: string,
  senderPlaintextByMessageId: Record<string, string>,
  decryptedBodyByMessageId: Record<string, string>,
): string {
  const isOwn = m.senderId === userId;
  const display = resolveMessageDisplayBody(
    m,
    isOwn,
    senderPlaintextByMessageId,
    decryptedBodyByMessageId,
  );
  const trimmed = display.trim();
  if (trimmed) {
    return trimmed;
  }
  if (m.mediaKey) {
    return 'Attachment';
  }
  return '';
}
