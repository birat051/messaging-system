import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { errorHandler } from './errorHandler.js';
import { createGlobalRestRateLimitMiddleware } from './globalRestRateLimit.js';

vi.mock('../rateLimit/globalRestRateLimit.js', () => ({
  isGlobalRestRateLimitExceeded: vi.fn(),
  globalRestRateLimitKey: (ip: string) => `ratelimit:global:ip:${ip}`,
}));

import { isGlobalRestRateLimitExceeded } from '../rateLimit/globalRestRateLimit.js';

const mockExceeded = vi.mocked(isGlobalRestRateLimitExceeded);

const minimalEnv = {
  GLOBAL_RATE_LIMIT_WINDOW_SEC: 60,
  GLOBAL_RATE_LIMIT_MAX: 500,
} as Env;

function buildApp(): express.Application {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use('/v1', createGlobalRestRateLimitMiddleware(minimalEnv));
  app.use('/v1', (req, res) => {
    res.status(200).json({ path: req.path });
  });
  app.use(errorHandler);
  return app;
}

describe('createGlobalRestRateLimitMiddleware', () => {
  beforeEach(() => {
    mockExceeded.mockReset();
    mockExceeded.mockResolvedValue(false);
  });

  it('does not increment global limit for GET /v1/health (excluded path)', async () => {
    const app = buildApp();
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.path).toBe('/health');
    expect(mockExceeded).not.toHaveBeenCalled();
  });

  it('does not increment global limit for GET /v1/ready (excluded path)', async () => {
    const app = buildApp();
    const res = await request(app).get('/v1/ready');
    expect(res.status).toBe(200);
    expect(res.body.path).toBe('/ready');
    expect(mockExceeded).not.toHaveBeenCalled();
  });

  it('calls global rate limit for non-excluded /v1 paths', async () => {
    const app = buildApp();
    await request(app).get('/v1/users/me');
    expect(mockExceeded).toHaveBeenCalledTimes(1);
    expect(mockExceeded).toHaveBeenCalledWith(
      minimalEnv,
      expect.stringMatching(/./),
    );
  });

  it('returns 429 with RATE_LIMIT_EXCEEDED when limit is exceeded', async () => {
    mockExceeded.mockResolvedValueOnce(true);
    const app = buildApp();
    const res = await request(app).get('/v1/probe');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests; try again later',
    });
  });

  it('uses X-Forwarded-For first hop as client IP for rate limit check', async () => {
    const app = buildApp();
    await request(app)
      .get('/v1/x')
      .set('X-Forwarded-For', '203.0.113.50, 10.0.0.1');
    expect(mockExceeded).toHaveBeenCalledWith(minimalEnv, '203.0.113.50');
  });
});
