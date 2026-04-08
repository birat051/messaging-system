import { Router } from 'express';
import { isReady } from '../readiness.js';

export const systemRouter = Router();

/** Liveness — process is running (no dependency checks). */
systemRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/** Readiness — dependencies satisfied enough to serve traffic. */
systemRouter.get('/ready', async (_req, res, next) => {
  try {
    const ready = await isReady();
    if (!ready) {
      res.status(503).json({ ready: false });
      return;
    }
    res.status(200).json({ ready: true });
  } catch (err) {
    next(err);
  }
});
