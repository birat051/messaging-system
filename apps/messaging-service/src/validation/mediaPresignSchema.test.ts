import { describe, expect, it } from 'vitest';
import { createMediaPresignRequestSchema } from './schemas.js';

describe('createMediaPresignRequestSchema', () => {
  const schema = createMediaPresignRequestSchema(1024);

  it('accepts valid JSON-shaped input', () => {
    const r = schema.safeParse({
      contentType: 'image/png',
      contentLength: 100,
      filename: 'photo.png',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({
        contentType: 'image/png',
        contentLength: 100,
        filename: 'photo.png',
      });
    }
  });

  it('coerces string contentLength (query)', () => {
    const r = schema.safeParse({
      contentType: 'image/jpeg',
      contentLength: '512',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contentLength).toBe(512);
      expect(r.data.filename).toBeUndefined();
    }
  });

  it('rejects contentLength above max', () => {
    const r = schema.safeParse({
      contentType: 'image/jpeg',
      contentLength: 2000,
    });
    expect(r.success).toBe(false);
  });

  it('trims empty filename to undefined', () => {
    const r = schema.safeParse({
      contentType: 'image/gif',
      contentLength: 10,
      filename: '   ',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.filename).toBeUndefined();
    }
  });
});
