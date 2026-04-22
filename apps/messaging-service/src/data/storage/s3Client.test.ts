import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv, resetEnvCacheForTests } from '../../config/env.js';
import {
  getS3Client,
  getS3ClientForPresignPut,
  resetS3ClientForTests,
  resolveS3PresignPutEndpoint,
} from './s3Client.js';

describe('resolveS3PresignPutEndpoint / getS3ClientForPresignPut', () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    resetS3ClientForTests();
    process.env.S3_BUCKET = 'test-bucket';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    process.env.JWT_SECRET = 'x'.repeat(32);
  });

  afterEach(() => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_PUBLIC_BASE_URL;
    delete process.env.S3_PRESIGN_ENDPOINT;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    resetEnvCacheForTests();
    resetS3ClientForTests();
  });

  it('prefers S3_PRESIGN_ENDPOINT over S3_PUBLIC_BASE_URL and S3_ENDPOINT', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000';
    process.env.S3_PUBLIC_BASE_URL = 'http://localhost:9000';
    process.env.S3_PRESIGN_ENDPOINT = 'http://presign.example:9000';
    expect(resolveS3PresignPutEndpoint(loadEnv())).toBe(
      'http://presign.example:9000',
    );
  });

  it('uses S3_PUBLIC_BASE_URL when S3_PRESIGN_ENDPOINT is unset', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000';
    process.env.S3_PUBLIC_BASE_URL = 'http://localhost:9000';
    expect(resolveS3PresignPutEndpoint(loadEnv())).toBe(
      'http://localhost:9000',
    );
  });

  it('returns a dedicated client when presign host differs from S3_ENDPOINT', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000';
    process.env.S3_PUBLIC_BASE_URL = 'http://localhost:9000';
    const env = loadEnv();
    const presign = getS3ClientForPresignPut(env);
    const server = getS3Client(env);
    expect(presign).not.toBe(server);
  });

  it('reuses singleton when presign endpoint matches S3_ENDPOINT', () => {
    process.env.S3_ENDPOINT = 'https://127.0.0.1:9000';
    const env = loadEnv();
    expect(resolveS3PresignPutEndpoint(loadEnv())).toBe(
      'https://127.0.0.1:9000',
    );
    expect(getS3ClientForPresignPut(env)).toBe(getS3Client(env));
  });
});
