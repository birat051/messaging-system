import { describe, expect, it } from 'vitest';
import { serializeIceCandidateForSignaling } from './webrtcIceCandidateSerialize';

describe('serializeIceCandidateForSignaling', () => {
  it('returns empty object for null candidate', () => {
    expect(serializeIceCandidateForSignaling(null)).toEqual({});
  });

  it('serializes a mocked candidate via toJSON', () => {
    const c = {
      toJSON: () => ({
        candidate: 'candidate:1',
        sdpMid: '0',
        sdpMLineIndex: 0,
      }),
    } as unknown as RTCIceCandidate;
    expect(serializeIceCandidateForSignaling(c)).toEqual({
      candidate: 'candidate:1',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
  });
});
