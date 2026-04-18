import { describe, expect, it } from 'vitest';
import { formatGuestSessionTimeRemaining } from './guestSessionTimeRemaining';

describe('formatGuestSessionTimeRemaining', () => {
  it('formats minutes for mid-range expiry', () => {
    const now = Date.parse('2026-06-01T12:00:00.000Z');
    const iso = '2026-06-01T12:25:00.000Z';
    expect(formatGuestSessionTimeRemaining(iso, now)).toBe('25 min');
  });

  it('returns empty for invalid iso', () => {
    expect(formatGuestSessionTimeRemaining('not-a-date', 0)).toBe('');
  });

  it('returns 0s at or after expiry (expired access window)', () => {
    const now = Date.parse('2026-06-01T12:00:00.000Z');
    const expired = '2026-06-01T11:59:45.000Z';
    expect(formatGuestSessionTimeRemaining(expired, now)).toBe('0s');
  });
});
