/**
 * In-tab **`notification`** Socket.IO payloads (**`docs/PROJECT_PLAN.md`** §8.2–§8.4).
 * Validated in **`socketWorker.ts`** before **`postMessage`** to the main thread.
 */

export type NotificationMessagePayload = {
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

export type NotificationCallIncomingPayload = {
  schemaVersion: 1;
  kind: 'call_incoming';
  notificationId: string;
  occurredAt: string;
  media: 'audio' | 'video';
  callScope: 'direct' | 'group';
  callId: string;
  callerUserId: string;
  callerDisplayName: string | null;
  conversationId?: string;
  groupId?: string;
  groupTitle?: string | null;
};

export type ParsedNotificationPayload =
  | NotificationMessagePayload
  | NotificationCallIncomingPayload;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseMessageKind(
  o: Record<string, unknown>,
): NotificationMessagePayload | null {
  if (!isNonEmptyString(o.notificationId)) return null;
  if (!isNonEmptyString(o.occurredAt)) return null;
  const threadType = o.threadType;
  if (threadType !== 'direct' && threadType !== 'group') return null;
  if (!isNonEmptyString(o.conversationId)) return null;
  if (!isNonEmptyString(o.messageId)) return null;
  if (!isNonEmptyString(o.senderUserId)) return null;

  const base: NotificationMessagePayload = {
    schemaVersion: 1,
    kind: 'message',
    notificationId: o.notificationId.trim(),
    occurredAt: o.occurredAt.trim(),
    threadType,
    conversationId: o.conversationId.trim(),
    messageId: o.messageId.trim(),
    senderUserId: o.senderUserId.trim(),
  };
  if ('senderDisplayName' in o) {
    const s = o.senderDisplayName;
    if (s !== null && s !== undefined && typeof s !== 'string') return null;
    base.senderDisplayName = s === null || s === undefined ? null : s;
  }
  if ('preview' in o && o.preview !== undefined) {
    if (typeof o.preview !== 'string') return null;
    base.preview = o.preview;
  }
  if (threadType === 'group') {
    if (!isNonEmptyString(o.groupId)) return null;
    base.groupId = o.groupId.trim();
    if ('groupTitle' in o) {
      const gt = o.groupTitle;
      if (gt !== null && gt !== undefined && typeof gt !== 'string') return null;
      base.groupTitle = gt === null || gt === undefined ? null : gt;
    }
  }
  return base;
}

function parseCallIncomingKind(
  o: Record<string, unknown>,
): NotificationCallIncomingPayload | null {
  if (!isNonEmptyString(o.notificationId)) return null;
  if (!isNonEmptyString(o.occurredAt)) return null;
  const media = o.media;
  if (media !== 'audio' && media !== 'video') return null;
  const callScope = o.callScope;
  if (callScope !== 'direct' && callScope !== 'group') return null;
  if (!isNonEmptyString(o.callId)) return null;
  if (!isNonEmptyString(o.callerUserId)) return null;

  let callerDisplayName: string | null = null;
  if ('callerDisplayName' in o) {
    const c = o.callerDisplayName;
    if (c === null) {
      callerDisplayName = null;
    } else if (typeof c === 'string') {
      callerDisplayName = c;
    } else {
      return null;
    }
  }

  const base: NotificationCallIncomingPayload = {
    schemaVersion: 1,
    kind: 'call_incoming',
    notificationId: o.notificationId.trim(),
    occurredAt: o.occurredAt.trim(),
    media,
    callScope,
    callId: o.callId.trim(),
    callerUserId: o.callerUserId.trim(),
    callerDisplayName,
  };
  if ('conversationId' in o && o.conversationId !== undefined) {
    if (!isNonEmptyString(o.conversationId)) return null;
    base.conversationId = o.conversationId.trim();
  }
  if (callScope === 'group') {
    if (!isNonEmptyString(o.groupId)) return null;
    base.groupId = o.groupId.trim();
    if ('groupTitle' in o) {
      const gt = o.groupTitle;
      if (gt !== null && gt !== undefined && typeof gt !== 'string') return null;
      base.groupTitle = gt === null || gt === undefined ? null : gt;
    }
  }
  return base;
}

/** Validate **`notification`** body from **`socket.io`** before **`Worker.postMessage`**. */
export function parseNotificationWorkerPayload(
  input: unknown,
): ParsedNotificationPayload | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (o.schemaVersion !== 1) return null;
  const kind = o.kind;
  if (kind === 'message') {
    return parseMessageKind(o);
  }
  if (kind === 'call_incoming') {
    return parseCallIncomingKind(o);
  }
  return null;
}
