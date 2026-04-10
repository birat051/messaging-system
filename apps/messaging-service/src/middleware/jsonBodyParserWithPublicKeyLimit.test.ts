import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { errorHandler } from './errorHandler.js';
import { createJsonBodyParserWithPublicKeyLimit } from './jsonBodyParserWithPublicKeyLimit.js';

const env = {
  PUBLIC_KEY_JSON_BODY_MAX_BYTES: 256,
} as Env;

describe('createJsonBodyParserWithPublicKeyLimit', () => {
  it('returns 413 when JSON body exceeds cap on public-key routes', async () => {
    const app = express();
    app.use(createJsonBodyParserWithPublicKeyLimit(env));
    app.post('/v1/users/me/public-key/rotate', (req, res) => {
      res.status(200).json({ ok: true });
    });
    app.use(errorHandler);

    const big = 'x'.repeat(400);
    const res = await request(app)
      .post('/v1/users/me/public-key/rotate')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ publicKey: big }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('allows larger bodies on other paths', async () => {
    const app = express();
    app.use(createJsonBodyParserWithPublicKeyLimit(env));
    app.post('/v1/other', (req, res) => {
      res.status(200).json({ len: JSON.stringify(req.body).length });
    });
    app.use(errorHandler);

    const body = { data: 'y'.repeat(500) };
    const res = await request(app)
      .post('/v1/other')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
  });
});
