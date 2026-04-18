import { z } from 'zod';

const callIdSchema = z.string().min(8).max(128);
const userIdSchema = z.string().min(1).max(128);
const optionalConversationId = z.string().min(1).max(128).optional();

/**
 * Client → server: relay an SDP **offer** to **`toUserId`** (**Socket.IO** **`webrtc:offer`**).
 */
export const webrtcOfferSchema = z.object({
  toUserId: userIdSchema,
  callId: callIdSchema,
  /** Session description protocol text from **`RTCSessionDescription.sdp`**. */
  sdp: z.string().min(1).max(262_144),
  conversationId: optionalConversationId,
});

export type WebrtcOfferPayload = z.infer<typeof webrtcOfferSchema>;

/**
 * Client → server: relay an SDP **answer** (**`webrtc:answer`**).
 */
export const webrtcAnswerSchema = z.object({
  toUserId: userIdSchema,
  callId: callIdSchema,
  sdp: z.string().min(1).max(262_144),
  conversationId: optionalConversationId,
});

export type WebrtcAnswerPayload = z.infer<typeof webrtcAnswerSchema>;

/**
 * **`RTCIceCandidateInit`**-shaped relay (**`webrtc:candidate`**).
 */
export const webrtcIceCandidateSchema = z.object({
  toUserId: userIdSchema,
  callId: callIdSchema,
  conversationId: optionalConversationId,
  candidate: z.object({
    candidate: z.string().max(4096).optional(),
    sdpMid: z.string().max(128).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).nullable().optional(),
  }),
});

export type WebrtcIceCandidatePayload = z.infer<typeof webrtcIceCandidateSchema>;
