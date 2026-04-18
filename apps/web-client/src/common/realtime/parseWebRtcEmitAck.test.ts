import { describe, expect, it } from 'vitest';
import { parseWebRtcEmitAck } from './parseWebRtcEmitAck';

describe('parseWebRtcEmitAck', () => {
  it('accepts ok: true', () => {
    expect(parseWebRtcEmitAck({ ok: true })).toEqual({ ok: true });
  });

  it('maps error codes to Error', () => {
    const r = parseWebRtcEmitAck({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'bad sdp',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('bad sdp');
    }
  });
});
