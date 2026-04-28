import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMediaPublicDisplayFallbackUrl,
  getMediaPublicObjectUrl,
  isLikelyImageMediaKey,
  isPresignedS3PutObjectUrl,
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

  it('detects MinIO/S3 presigned PUT (not safe for <img src GET>)', () => {
    const put =
      'http://localhost:9000/bucket/k.png?x-id=PutObject&X-Amz-Algorithm=AWS4-HMAC-SHA256';
    expect(isPresignedS3PutObjectUrl(put)).toBe(true);
    expect(isPresignedS3PutObjectUrl('https://cdn.example.com/x.png')).toBe(false);
  });

  it('resolveMediaAttachmentDisplayUrl rejects presigned PUT override in favor of public path from key', () => {
    const put =
      'http://localhost:9000/messaging-media/users/1/a.png?X-Amz-Signature=abc&x-id=PutObject';
    expect(resolveMediaAttachmentDisplayUrl('users/1/a.png', put)).toBe(
      'http://localhost:9000/messaging-media/users/1/a.png',
    );
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

  it('getMediaPublicDisplayFallbackUrl returns key URL when primary differs', () => {
    const keyUrl = getMediaPublicObjectUrl('users/1/a.png');
    expect(
      getMediaPublicDisplayFallbackUrl(
        'users/1/a.png',
        'https://cdn.example.com/other-path/a.png',
      ),
    ).toBe(keyUrl);
  });

  it('getMediaPublicDisplayFallbackUrl returns null when primary matches key URL or env missing', () => {
    const keyUrl = getMediaPublicObjectUrl('users/1/a.png');
    expect(getMediaPublicDisplayFallbackUrl('users/1/a.png', keyUrl)).toBeNull();
    expect(getMediaPublicDisplayFallbackUrl('users/1/a.png', '')).toBeNull();
    vi.stubEnv('VITE_S3_BUCKET', '');
    expect(
      getMediaPublicDisplayFallbackUrl('users/1/a.png', 'https://x.example/a.png'),
    ).toBeNull();
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
  });
});
