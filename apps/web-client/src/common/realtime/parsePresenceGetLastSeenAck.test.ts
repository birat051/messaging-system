import { describe, expect, it } from 'vitest';
import { parsePresenceGetLastSeenAck } from './parsePresenceGetLastSeenAck';

describe('parsePresenceGetLastSeenAck', () => {
  it('parses ok from redis', () => {
    const r = parsePresenceGetLastSeenAck({
      status: 'ok',
      source: 'redis',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        status: 'ok',
        source: 'redis',
        lastSeenAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('parses not_available', () => {
    const r = parsePresenceGetLastSeenAck({ status: 'not_available' });
    expect(r).toEqual({ ok: true, value: { status: 'not_available' } });
  });

  it('rejects status error', () => {
    const r = parsePresenceGetLastSeenAck({
      status: 'error',
      code: 'internal_error',
      message: 'failed',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('failed');
    }
  });

  it('rejects worker-style code ack', () => {
    const r = parsePresenceGetLastSeenAck({
      code: 'UNAVAILABLE',
      message: 'Socket not connected',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('Socket not connected');
    }
  });
});
