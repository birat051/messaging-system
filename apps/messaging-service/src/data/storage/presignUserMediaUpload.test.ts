import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv, resetEnvCacheForTests } from '../../config/env.js';
import { presignPutUserMedia } from './presignUserMediaUpload.js';
import { resetS3ClientForTests } from './s3Client.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue(
      'https://example.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=mock',
    ),
}));

describe('presignPutUserMedia', () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    resetS3ClientForTests();
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_ENDPOINT = 'https://127.0.0.1:9000';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    process.env.JWT_SECRET = 'x'.repeat(32);
  });

  afterEach(() => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_ENDPOINT;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    resetEnvCacheForTests();
    resetS3ClientForTests();
  });

  it('returns PUT metadata and calls getSignedUrl', async () => {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const env = loadEnv();

    const out = await presignPutUserMedia(env, 'user-1', {
      contentType: 'image/png',
      contentLength: 42,
      filename: 'a.png',
    });

    expect(out.method).toBe('PUT');
    expect(out.bucket).toBe('test-bucket');
    expect(out.key).toMatch(/^users\/user-1\//);
    expect(out.headers['Content-Type']).toBe('image/png');
    expect(out.headers['Content-Length']).toBe('42');
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });
});
