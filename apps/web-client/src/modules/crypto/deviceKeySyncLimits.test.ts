import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampDeviceKeySyncPageLimit,
  DEFAULT_DEVICE_KEY_SYNC_PAGE_LIMIT,
  MAX_DEVICE_KEY_SYNC_PAGE_LIMIT,
  resolveDeviceKeySyncPageLimit,
} from './deviceKeySyncLimits';

describe('deviceKeySyncLimits', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('clampDeviceKeySyncPageLimit', () => {
    it('clamps to 1..MAX', () => {
      expect(clampDeviceKeySyncPageLimit(0)).toBe(1);
      expect(clampDeviceKeySyncPageLimit(-5)).toBe(1);
      expect(clampDeviceKeySyncPageLimit(50)).toBe(50);
      expect(clampDeviceKeySyncPageLimit(100)).toBe(100);
      expect(clampDeviceKeySyncPageLimit(200)).toBe(MAX_DEVICE_KEY_SYNC_PAGE_LIMIT);
    });

    it('floors non-integers', () => {
      expect(clampDeviceKeySyncPageLimit(33.9)).toBe(33);
    });

    it('falls back to default for non-finite', () => {
      expect(clampDeviceKeySyncPageLimit(Number.NaN)).toBe(
        DEFAULT_DEVICE_KEY_SYNC_PAGE_LIMIT,
      );
    });
  });

  describe('resolveDeviceKeySyncPageLimit', () => {
    it('uses override when provided', () => {
      expect(resolveDeviceKeySyncPageLimit({ override: 42 })).toBe(42);
    });

    it('caps override at MAX', () => {
      expect(resolveDeviceKeySyncPageLimit({ override: 500 })).toBe(
        MAX_DEVICE_KEY_SYNC_PAGE_LIMIT,
      );
    });

    it('reads VITE_DEVICE_KEY_SYNC_PAGE_LIMIT when no override', () => {
      vi.stubEnv('VITE_DEVICE_KEY_SYNC_PAGE_LIMIT', '25');
      expect(resolveDeviceKeySyncPageLimit()).toBe(25);
    });

    it('defaults to 100 when env unset', () => {
      expect(resolveDeviceKeySyncPageLimit()).toBe(100);
    });
  });
});
