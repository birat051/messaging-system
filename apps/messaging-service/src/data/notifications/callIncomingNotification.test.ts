import { describe, expect, it } from 'vitest';
import {
  buildCallIncomingKindNotificationPayload,
  inferMediaFromWebRtcOfferSdp,
  parseCallIncomingNotificationBrokerBody,
} from './callIncomingNotification.js';

describe('inferMediaFromWebRtcOfferSdp', () => {
  it('returns video when SDP contains an m=video line', () => {
    expect(
      inferMediaFromWebRtcOfferSdp('v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF\r\n'),
    ).toBe('video');
  });

  it('returns audio when SDP has only m=audio', () => {
    expect(
      inferMediaFromWebRtcOfferSdp('v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF\r\n'),
    ).toBe('audio');
  });
});

describe('parseCallIncomingNotificationBrokerBody', () => {
  it('accepts a valid payload buffer', () => {
    const built = buildCallIncomingKindNotificationPayload({
      callId: 'call-id-12345678',
      callerUserId: 'u1',
      callerDisplayName: 'Pat',
      sdp: 'm=audio 9\r\n',
      conversationId: 'conv1',
    });
    const buf = Buffer.from(JSON.stringify(built), 'utf8');
    const parsed = parseCallIncomingNotificationBrokerBody(buf);
    expect(parsed).toEqual(built);
  });

  it('returns null for invalid JSON', () => {
    expect(parseCallIncomingNotificationBrokerBody(Buffer.from('x', 'utf8'))).toBe(
      null,
    );
  });

  it('returns null when kind is wrong', () => {
    const buf = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'message',
        notificationId: 'n1',
        occurredAt: '2026-01-01T00:00:00.000Z',
      }),
      'utf8',
    );
    expect(parseCallIncomingNotificationBrokerBody(buf)).toBe(null);
  });
});
