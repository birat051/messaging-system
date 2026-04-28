/**
 * Optional Prometheus /metrics text export (Node default metrics + app histograms).
 * Enable with ENABLE_PROMETHEUS_METRICS. Binds to the process registry only when enabled.
 */
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
  Registry,
} from 'prom-client';
import type { Server as IoServer } from 'socket.io';
import type { Env } from '../config/env.js';

let registry: Registry | null = null;
let init = false;

let httpRequestDuration: Histogram | null = null;
let httpRequestsTotal: Counter | null = null;
let socketioActiveConnections: Gauge | null = null;
let messageSendTotal: Counter | null = null;

function ensureEnabled(env: Env): boolean {
  if (init) {
    return registry !== null;
  }
  init = true;
  if (!env.ENABLE_PROMETHEUS_METRICS) {
    return false;
  }
  const r = new Registry();
  collectDefaultMetrics({ register: r });

  httpRequestDuration = new Histogram({
    name: 'messaging_http_request_duration_seconds',
    help: 'HTTP request duration in seconds (Express pipeline)',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [r],
  });

  httpRequestsTotal = new Counter({
    name: 'messaging_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [r],
  });

  socketioActiveConnections = new Gauge({
    name: 'messaging_socketio_active_connections',
    help: 'Connected Socket.IO clients on the default namespace',
    registers: [r],
  });

  messageSendTotal = new Counter({
    name: 'messaging_socketio_message_send_total',
    help: 'message:send handler outcomes (ack path)',
    labelNames: ['outcome'],
    registers: [r],
  });

  registry = r;
  return true;
}

/**
 * Call once at app build time (before `createPrometheusHttpMiddleware` / `registerMetricsRoute`) so
 * the HTTP layer sees enabled metrics and histograms.
 */
export function initPrometheusIfEnabled(env: Env): void {
  void ensureEnabled(env);
}

/**
 * Coarse path bucket for /v1 routes to avoid unbounded `route` label cardinality.
 */
export function getHttpRouteLabel(req: Request | IncomingMessage): string {
  const path =
    'path' in req && typeof req.path === 'string' && req.path
      ? req.path
      : (req.url ?? '').split('?')[0] || '/';
  if (path === '/metrics') {
    return '/metrics';
  }
  if (path === '/' || path === '') {
    return '/';
  }
  if (path.startsWith('/socket.io')) {
    return '/socket.io';
  }
  if (path.startsWith('/v1/')) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return `/v1/${parts[1]}/…`;
    }
    return '/v1/…';
  }
  if (path.startsWith('/api-docs')) {
    return '/api-docs/…';
  }
  return path.length > 64 ? `${path.slice(0, 61)}…` : path;
}

export function createPrometheusHttpMiddleware(_env: Env) {
  if (!httpRequestDuration) {
    return (_req: Request, _res: Response, next: NextFunction) => {
      next();
    };
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (!httpRequestDuration || !httpRequestsTotal) {
        return;
      }
      const sec = Number(process.hrtime.bigint() - start) / 1e9;
      const route = getHttpRouteLabel(req);
      const code = String(res.statusCode);
      const labels = { method: req.method, route, status_code: code };
      httpRequestDuration.observe(labels, sec);
      httpRequestsTotal.inc(labels);
    });
    next();
  };
}

export function registerMetricsRoute(
  app: import('express').Application,
  _env: Env,
): void {
  if (!registry) {
    return;
  }
  const reg = registry;
  app.get('/metrics', async (_req: Request, res: Response) => {
    try {
      res.setHeader('Content-Type', reg.contentType);
      res.end(await reg.metrics());
    } catch (err: unknown) {
      res.status(500).end(String(err));
    }
  });
}

export function installSocketioMetrics(
  io: IoServer,
  env: Env,
): void {
  if (!ensureEnabled(env) || !socketioActiveConnections) {
    return;
  }

  const refresh = () => {
    socketioActiveConnections?.set(io.sockets.sockets.size);
  };

  io.on('connection', (socket) => {
    refresh();
    socket.on('disconnect', () => {
      refresh();
    });
  });
  refresh();
}

type MessageSendOutcome =
  | 'success'
  | 'client_error'
  | 'rate_limited'
  | 'server_error'
  | 'ack_missing';

export function recordMessageSendOutcome(outcome: MessageSendOutcome): void {
  if (!messageSendTotal) {
    return;
  }
  messageSendTotal.inc({ outcome }, 1);
}
