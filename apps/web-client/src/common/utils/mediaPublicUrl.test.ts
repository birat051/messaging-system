import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMediaPublicObjectUrl,
  isLikelyImageMediaKey,
  resolveMediaAttachmentDisplayUrl,
} from './mediaPublicUrl';

describe('mediaPublicUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds path-style URLs aligned with messaging-service publicObjectUrl', () => {
    expect(getMediaPublicObjectUrl('users/u1/a b.png')).toBe(
      'http://localhost:9000/messaging-media/users/u1/a%20b.png',
    );
  });

  it('returns null for empty key or missing env', () => {
    expect(getMediaPublicObjectUrl('  ')).toBeNull();
    vi.stubEnv('VITE_S3_BUCKET', '');
    expect(getMediaPublicObjectUrl('users/1/a.png')).toBeNull();
  });

  it('detects common image extensions on keys', () => {
    expect(isLikelyImageMediaKey('users/1/x.PNG')).toBe(true);
    expect(isLikelyImageMediaKey('users/1/doc.pdf')).toBe(false);
  });

  it('resolveMediaAttachmentDisplayUrl prefers blob or http(s) override', () => {
    expect(
      resolveMediaAttachmentDisplayUrl('users/1/a.png', 'blob:abc'),
    ).toBe('blob:abc');
    expect(
      resolveMediaAttachmentDisplayUrl('users/1/a.png', 'https://cdn.example.com/obj'),
    ).toBe('https://cdn.example.com/obj');
  });

  it('resolveMediaAttachmentDisplayUrl falls back to public URL from key when override missing', () => {
    expect(resolveMediaAttachmentDisplayUrl('users/1/a.png', null)).toBe(
      'http://localhost:9000/messaging-media/users/1/a.png',
    );
  });

  it('resolveMediaAttachmentDisplayUrl ignores invalid override strings', () => {
    expect(
      resolveMediaAttachmentDisplayUrl('users/1/a.png', 'javascript:alert(1)'),
    ).toBe('http://localhost:9000/messaging-media/users/1/a.png');
  });
});
