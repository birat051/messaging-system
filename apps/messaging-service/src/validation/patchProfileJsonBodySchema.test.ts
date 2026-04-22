import { describe, expect, it } from 'vitest';
import { patchProfileJsonBodySchema } from './schemas.js';

describe('patchProfileJsonBodySchema', () => {
  it('accepts profilePictureMediaKey alone', () => {
    const r = patchProfileJsonBodySchema.safeParse({
      profilePictureMediaKey: 'users/u1/abc-photo.png',
    });
    expect(r.success).toBe(true);
  });

  it('rejects profilePicture URL together with profilePictureMediaKey', () => {
    const r = patchProfileJsonBodySchema.safeParse({
      profilePicture: 'https://example.com/a.png',
      profilePictureMediaKey: 'users/u1/k',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty body', () => {
    const r = patchProfileJsonBodySchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('allows profilePicture null with displayName', () => {
    const r = patchProfileJsonBodySchema.safeParse({
      profilePicture: null,
      displayName: 'N',
    });
    expect(r.success).toBe(true);
  });
});
