import type { RequestHandler } from 'express';
import { isReady } from '../utils/readiness.js';

/** Liveness — process is running (no dependency checks). */
export const getHealth: RequestHandler = (_req, res) => {
  res.status(200).json({ status: 'ok' });
};

/** Readiness — dependencies satisfied enough to serve traffic. */
export const getReady: RequestHandler = async (_req, res, next) => {
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
};
