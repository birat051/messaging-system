import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMediaPublicObjectUrl,
  isLikelyImageMediaKey,
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
});
