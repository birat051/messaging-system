import { describe, expect, it } from 'vitest';
import { batchSyncMessageKeysRequestSchema } from './schemas.js';

describe('batchSyncMessageKeysRequestSchema', () => {
  it('accepts a minimal valid body', () => {
    const v = batchSyncMessageKeysRequestSchema.parse({
      targetDeviceId: 'new-dev',
      keys: [{ messageId: 'm1', encryptedMessageKey: 'wrap' }],
    });
    expect(v.targetDeviceId).toBe('new-dev');
    expect(v.keys).toHaveLength(1);
  });

  it('rejects empty keys array', () => {
    const r = batchSyncMessageKeysRequestSchema.safeParse({
      targetDeviceId: 'x',
      keys: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const r = batchSyncMessageKeysRequestSchema.safeParse({
      targetDeviceId: 'x',
      keys: [{ messageId: 'm', encryptedMessageKey: 'k' }],
      extra: 1,
    });
    expect(r.success).toBe(false);
  });
});
