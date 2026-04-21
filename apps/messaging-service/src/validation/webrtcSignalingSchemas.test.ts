import { describe, expect, it } from 'vitest';
import {
  webrtcAnswerSchema,
  webrtcHangupSchema,
  webrtcIceCandidateSchema,
  webrtcOfferSchema,
} from './webrtcSignalingSchemas.js';

describe('webrtcSignalingSchemas', () => {
  it('accepts minimal offer', () => {
    const r = webrtcOfferSchema.safeParse({
      toUserId: 'peer',
      callId: 'call-id-123456',
      sdp: 'v=0\r\n',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty sdp', () => {
    const r = webrtcOfferSchema.safeParse({
      toUserId: 'peer',
      callId: 'call-id-123456',
      sdp: '',
    });
    expect(r.success).toBe(false);
  });

  it('accepts ice candidate', () => {
    const r = webrtcIceCandidateSchema.safeParse({
      toUserId: 'peer',
      callId: 'call-id-123456',
      candidate: { candidate: 'x', sdpMid: '0', sdpMLineIndex: 0 },
    });
    expect(r.success).toBe(true);
  });

  it('answer matches offer shape', () => {
    const r = webrtcAnswerSchema.safeParse({
      toUserId: 'peer',
      callId: 'call-id-123456',
      sdp: 'v=0\r\n',
    });
    expect(r.success).toBe(true);
  });

  it('accepts hangup payload', () => {
    const r = webrtcHangupSchema.safeParse({
      toUserId: 'peer',
      callId: 'call-id-123456',
    });
    expect(r.success).toBe(true);
  });
});
