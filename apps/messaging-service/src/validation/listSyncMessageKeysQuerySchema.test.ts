import { describe, expect, it } from 'vitest';
import { listSyncMessageKeysQuerySchema } from './schemas.js';

describe('listSyncMessageKeysQuerySchema', () => {
  it('parses required deviceId and default limit', () => {
    expect(
      listSyncMessageKeysQuerySchema.parse({
        deviceId: 'default',
      }),
    ).toEqual({ deviceId: 'default', afterMessageId: undefined, limit: 20 });
  });

  it('parses afterMessageId and limit', () => {
    expect(
      listSyncMessageKeysQuerySchema.parse({
        deviceId: 'abc-1',
        afterMessageId: 'msg-uuid',
        limit: '5',
      }),
    ).toEqual({
      deviceId: 'abc-1',
      afterMessageId: 'msg-uuid',
      limit: 5,
    });
  });

  it('rejects deviceId with dots', () => {
    const r = listSyncMessageKeysQuerySchema.safeParse({
      deviceId: 'a.b',
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown query keys', () => {
    const r = listSyncMessageKeysQuerySchema.safeParse({
      deviceId: 'x',
      extra: '1',
    });
    expect(r.success).toBe(false);
  });
});
