import { describe, expect, it } from 'vitest';
import { deviceIdPathSchema } from './schemas.js';

describe('deviceIdPathSchema', () => {
  it('accepts UUID and default-style ids', () => {
    expect(
      deviceIdPathSchema.safeParse({
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(true);
    expect(deviceIdPathSchema.safeParse({ deviceId: 'default' }).success).toBe(
      true,
    );
  });

  it('rejects empty, overlong, or invalid charset', () => {
    expect(deviceIdPathSchema.safeParse({ deviceId: '' }).success).toBe(false);
    expect(
      deviceIdPathSchema.safeParse({ deviceId: 'a'.repeat(129) }).success,
    ).toBe(false);
    expect(deviceIdPathSchema.safeParse({ deviceId: 'bad id' }).success).toBe(
      false,
    );
    expect(deviceIdPathSchema.safeParse({ deviceId: 'x/y' }).success).toBe(
      false,
    );
  });
});
