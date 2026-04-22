import { describe, expect, it } from 'vitest';
import { resolveMediaMimeForUpload } from './mediaAllowedMime';

describe('resolveMediaMimeForUpload', () => {
  it('uses File.type when set and allowed', () => {
    const f = new File(['x'], 'a.png', { type: 'image/png' });
    expect(resolveMediaMimeForUpload(f)).toBe('image/png');
  });

  it('infers from extension when type is empty', () => {
    const f = new File(['x'], 'photo.JPEG', { type: '' });
    expect(resolveMediaMimeForUpload(f)).toBe('image/jpeg');
  });

  it('returns null when unknown', () => {
    const f = new File(['x'], 'x.exe', { type: '' });
    expect(resolveMediaMimeForUpload(f)).toBeNull();
  });
});
