import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const callIncomingKindNotificationSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('call_incoming'),
  notificationId: z.string().min(1),
  occurredAt: z.string().min(1),
  media: z.enum(['audio', 'video']),
  callScope: z.literal('direct'),
  callId: z.string().min(1),
  callerUserId: z.string().min(1),
  callerDisplayName: z.string().nullable(),
  conversationId: z.string().min(1).optional(),
});

/**
 * In-tab **`notification`** payload for **`kind: "call_incoming"`** — **`docs/PROJECT_PLAN.md`** §8.4.
 * Published on **`message.call.user.<calleeUserId>`**; consumer emits to **`user:<calleeUserId>`** (Feature 7).
 */
export type CallIncomingKindNotificationPayload = z.infer<
  typeof callIncomingKindNotificationSchema
>;

/** Infer **audio** vs **video** ring from the offer SDP (WebRTC **`m=`** lines). */
export function inferMediaFromWebRtcOfferSdp(sdp: string): 'audio' | 'video' {
  return /\bm=video\b/i.test(sdp) ? 'video' : 'audio';
}

export function buildCallIncomingKindNotificationPayload(params: {
  callId: string;
  callerUserId: string;
  callerDisplayName: string | null;
  sdp: string;
  conversationId?: string;
}): CallIncomingKindNotificationPayload {
  const base: CallIncomingKindNotificationPayload = {
    schemaVersion: 1,
    kind: 'call_incoming',
    notificationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    media: inferMediaFromWebRtcOfferSdp(params.sdp),
    callScope: 'direct',
    callId: params.callId,
    callerUserId: params.callerUserId,
    callerDisplayName: params.callerDisplayName,
  };
  if (params.conversationId !== undefined) {
    base.conversationId = params.conversationId;
  }
  return base;
}

export function parseCallIncomingNotificationBrokerBody(
  buf: Buffer,
): CallIncomingKindNotificationPayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(buf.toString('utf8')) as unknown;
  } catch {
    return null;
  }
  const parsed = callIncomingKindNotificationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
