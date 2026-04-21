import { describe, expect, it } from 'vitest';
import { listMyDevicesQuerySchema } from './schemas.js';

describe('listMyDevicesQuerySchema', () => {
  it('accepts an empty query object', () => {
    expect(listMyDevicesQuerySchema.parse({})).toEqual({});
  });

  it('rejects unknown query keys', () => {
    const r = listMyDevicesQuerySchema.safeParse({ foo: '1' });
    expect(r.success).toBe(false);
  });
});
