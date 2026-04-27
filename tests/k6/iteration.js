/**
 * One VU iteration: auth → health → **think** → (optional **media** simulate) → Socket.IO **pair**:
 * either **active** send (burst + receipts) or **idle** connect-hold (see `behavior.js`), then **sleep(1/rate)**.
 * @file
 */
import { check, sleep } from 'k6';
import http from 'k6/http';
import { getConfig } from './config.js';
import { resolveUserAuth } from './auth.js';
import {
  isActiveMessageIteration,
  sleepMediaTrancheIfAny,
  sleepPreActionThink,
} from './behavior.js';
import { http5xx } from './metrics.js';
import { getHealthPath, runSendOrStub, stubMessageSend } from './socketio.js';
import { k6HttpTags } from './tags.js';
import { userPool } from './user-pool.js';

/** Per-VU, per-`sessionKey` — survives across iterations in this VU. */
const authCache = /** @type {Record<string, { accessToken: string, refreshToken: string, userId: string } | undefined>} */ ({});

/**
 * @param {{ email?: string, password?: string, userId?: string, accessToken?: string, refreshToken?: string }} row
 * @param {import('./config.js').K6Config} c
 */
function obtainUserAuth(row, c) {
  return resolveUserAuth(c.baseUrl, c, row, authCache);
}

export function runLoadIteration() {
  const c = getConfig();
  const maxPairs = Math.floor(userPool.length / 2);
  if (maxPairs < 1) {
    const row = userPool[(__VU - 1) % userPool.length];
    const u = obtainUserAuth(row, c);
    if (!u) {
      check(null, { 'auth (login or refresh)': () => false });
      return;
    }
    check(u, { 'user has access + userId': (x) => Boolean(x && x.accessToken && x.userId) });
    const h = http.get(getHealthPath(c.baseUrl), {
      tags: k6HttpTags({ name: 'Health' }),
    });
    if (h.status >= 500) {
      http5xx.add(1);
    } else {
      http5xx.add(0);
    }
    check(h, { 'health 200': (r) => r.status === 200 });
    sleepPreActionThink(c);
    if (isActiveMessageIteration(c)) {
      sleepMediaTrancheIfAny(c);
      stubMessageSend(c, u.accessToken, u.userId);
    } else {
      check(null, { 'idle single-user slot (no paired socket)': () => true });
      sleep(c.idleHoldSec);
    }
    if (c.messageRate > 0) {
      sleep(1.0 / c.messageRate);
    } else {
      sleep(1);
    }
    return;
  }

  // Deterministic pairs: (load-user-0001, load-user-0002), (0003, 0004), …; same for any pool in pair order.
  const pairIndex = (__VU - 1) % maxPairs;
  const rowA = userPool[pairIndex * 2];
  const rowB = userPool[pairIndex * 2 + 1];
  const userA = obtainUserAuth(rowA, c);
  if (!userA) {
    check(null, { 'user A auth': () => false });
    return;
  }
  const userB = obtainUserAuth(rowB, c);
  if (!userB) {
    check(null, { 'user B auth': () => false });
    return;
  }
  check(userA, { 'A has tokens': (x) => Boolean(x && x.accessToken && x.userId) });
  check(userB, { 'B has tokens': (x) => Boolean(x && x.accessToken && x.userId) });

  const h = http.get(getHealthPath(c.baseUrl), {
    tags: k6HttpTags({ name: 'Health' }),
  });
  if (h.status >= 500) {
    http5xx.add(1);
  } else {
    http5xx.add(0);
  }
  check(h, { 'health 200': (r) => r.status === 200 });

  sleepPreActionThink(c);
  if (isActiveMessageIteration(c)) {
    sleepMediaTrancheIfAny(c);
    runSendOrStub(
      c,
      { accessToken: userA.accessToken, userId: userA.userId },
      { accessToken: userB.accessToken, userId: userB.userId },
      { idle: false },
    );
  } else {
    check(null, { 'idle paired sockets (no send)': () => true });
    runSendOrStub(
      c,
      { accessToken: userA.accessToken, userId: userA.userId },
      { accessToken: userB.accessToken, userId: userB.userId },
      { idle: true },
    );
  }

  if (c.messageRate > 0) {
    sleep(1.0 / c.messageRate);
  } else {
    sleep(1);
  }
}
