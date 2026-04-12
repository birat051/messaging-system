import { describe, expect, it } from 'vitest';
import { parseReceiptEmitAck } from './socketReceiptEmitAck';

describe('parseReceiptEmitAck', () => {
  it('accepts ok: true', () => {
    const r = parseReceiptEmitAck({ ok: true });
    expect(r.ok).toBe(true);
  });

  it('maps server error codes', () => {
    const r = parseReceiptEmitAck({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('Too many');
    }
  });

  it('rejects unknown shapes', () => {
    const r = parseReceiptEmitAck({});
    expect(r.ok).toBe(false);
  });
});
