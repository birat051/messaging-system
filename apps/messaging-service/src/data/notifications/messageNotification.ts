import { randomUUID } from 'node:crypto';
import type { Server as SocketIoServer } from 'socket.io';
import type { MessageApiPayload } from '../messages/messageApiShape.js';

/**
 * In-tab **`notification`** payload for **`kind: "message"`** — **`docs/PROJECT_PLAN.md`** §8.3.
 * **`kind: call_incoming`** is built in **`callIncomingNotification.ts`** (broker **`message.call.user.*`**).
 */
export type MessageKindNotificationPayload = {
  schemaVersion: 1;
  kind: 'message';
  notificationId: string;
  occurredAt: string;
  threadType: 'direct' | 'group';
  conversationId: string;
  messageId: string;
  senderUserId: string;
  senderDisplayName?: string | null;
  preview?: string;
  groupId?: string;
  groupTitle?: string | null;
};

export const MESSAGE_NOTIFICATION_PREVIEW_MAX = 160;

/** Short preview for toast — never log as plaintext at error level; may be E2EE ciphertext. */
export function buildMessagePreview(
  body: string | null,
  mediaKey: string | null,
): string | undefined {
  const text = body?.trim() ?? '';
  if (text.length > 0) {
    if (text.length <= MESSAGE_NOTIFICATION_PREVIEW_MAX) {
      return text;
    }
    return `${text.slice(0, MESSAGE_NOTIFICATION_PREVIEW_MAX - 1)}…`;
  }
  if (mediaKey?.trim()) {
    return 'Attachment';
  }
  return undefined;
}

export function buildMessageKindNotificationPayload(
  message: MessageApiPayload,
  senderDisplayName: string | null,
  opts: {
    threadType: 'direct' | 'group';
    groupId?: string;
    groupTitle?: string | null;
  },
): MessageKindNotificationPayload {
  const preview = buildMessagePreview(message.body, message.mediaKey);
  const base: MessageKindNotificationPayload = {
    schemaVersion: 1,
    kind: 'message',
    notificationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    threadType: opts.threadType,
    conversationId: message.conversationId,
    messageId: message.id,
    senderUserId: message.senderId,
    senderDisplayName: senderDisplayName?.trim() || null,
  };
  if (preview !== undefined) {
    base.preview = preview;
  }
  if (opts.threadType === 'group' && opts.groupId?.trim()) {
    base.groupId = opts.groupId.trim();
    base.groupTitle = opts.groupTitle ?? null;
  }
  return base;
}

/**
 * Direct 1:1: emit to **`user:<recipientUserId>`** after **`message:new`** (recipient fan-out only).
 * All recipients receive **`notification`**; the **web-client** chooses alert audio by **`kind`** (e.g. message vs call).
 */
export function emitMessageNotificationDirect(
  io: SocketIoServer,
  recipientUserId: string,
  message: MessageApiPayload,
  senderDisplayName: string | null,
): void {
  const payload = buildMessageKindNotificationPayload(message, senderDisplayName, {
    threadType: 'direct',
  });
  io.to(`user:${recipientUserId}`).emit('notification', payload);
}

/**
 * Group thread: emit **`notification`** to **`group:<groupId>`** so joined clients can toast
 * (skip locally when **`senderUserId`** is self). Call when group messaging publishes to the broker.
 * Use **`exceptSocketId`** for the originating **`message:send`** socket so that tab does not toast.
 */
export function emitMessageNotificationToGroupRoom(
  io: SocketIoServer,
  groupId: string,
  message: MessageApiPayload,
  senderDisplayName: string | null,
  groupTitle: string | null,
  opts?: { exceptSocketId?: string },
): void {
  const payload = buildMessageKindNotificationPayload(message, senderDisplayName, {
    threadType: 'group',
    groupId,
    groupTitle,
  });
  const room = `group:${groupId}`;
  if (opts?.exceptSocketId) {
    io.to(room).except(opts.exceptSocketId).emit('notification', payload);
  } else {
    io.to(room).emit('notification', payload);
  }
}
