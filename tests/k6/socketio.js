/**
 * Socket.IO (Engine.IO v4) over WebSocket — 1:1 `message:send` / `message:new` + optional receipts.
 * Uses `k6/websockets` (two clients per VU: recipient B then sender A; B connects first).
 * @file
 */
import { check, sleep } from 'k6';
import { WebSocket } from 'k6/websockets';
import {
  connectedSockets,
  duplicateMessageNewTotal,
  droppedMessagesTotal,
  e2eConversationReadToSenderMs,
  e2eDeliveredToSenderMs,
  e2eMessageNewMs,
  e2eReadToSenderMs,
  messageSendAckErrMs,
  messageSendAckOkMs,
  msgSendAckedTotal,
  receiptEmitToAckMs,
  receiptEventsTotal,
  sioConnectFailures,
  sioConnectMs,
  sioMessageSendErrorRate,
  sioNotImplemented,
} from './metrics.js';

/**
 * @param {string} origin  `http(s)://host[:port]`
 * @returns {string} `ws(s)://host[:port]/socket.io/?EIO=4&transport=websocket`
 */
export function toEngineWsUrl(origin) {
  const o = origin.replace(/\/$/, '');
  if (o.startsWith('https://')) {
    return o.replace('https://', 'wss://') + '/socket.io/?EIO=4&transport=websocket';
  }
  if (o.startsWith('http://')) {
    return o.replace('http://', 'ws://') + '/socket.io/?EIO=4&transport=websocket';
  }
  if (o.startsWith('wss://') || o.startsWith('ws://')) {
    return o + '/socket.io/?EIO=4&transport=websocket';
  }
  return 'ws://' + o + '/socket.io/?EIO=4&transport=websocket';
}

/**
 * @param {string} inner  Socket.IO wire string (no Engine prefix)
 * @returns {{ type: number, id?: number, data: unknown } | null}
 */
export function parseInnerPacket(inner) {
  if (!inner || inner.length < 1) {
    return null;
  }
  const t = Number(inner[0]);
  if (t === 0) {
    const data =
      inner.length > 1 ? JSON.parse(inner.slice(1)) : undefined;
    return { type: 0, data };
  }
  if (t === 2) {
    if (inner[1] === '[') {
      return { type: 2, data: JSON.parse(inner.slice(1)) };
    }
    let j = 1;
    while (j < inner.length && inner[j] >= '0' && inner[j] <= '9') {
      j++;
    }
    const id = j > 1 ? Number(inner.slice(1, j)) : undefined;
    return { type: 2, id, data: JSON.parse(inner.slice(j)) };
  }
  if (t === 3) {
    let j = 1;
    while (j < inner.length && inner[j] >= '0' && inner[j] <= '9') {
      j++;
    }
    const id = Number(inner.slice(1, j));
    const data = JSON.parse(inner.slice(j));
    return { type: 3, id, data };
  }
  if (t === 4) {
    const data =
      inner.length > 1
        ? JSON.parse(inner.slice(1))
        : undefined;
    return { type: 4, data };
  }
  return null;
}

export function wrapEngine(ioPacket) {
  return '4' + ioPacket;
}

/**
 * @param {Record<string, string>} auth  `{ token, userId }`
 * @returns {string}
 */
function encodeNamespaceConnect(auth) {
  return '0' + JSON.stringify(auth);
}

/**
 * @param {null | number} ackId
 * @param {string} event
 * @param {unknown} payload
 * @returns {string}
 */
export function encodeEvent(ackId, event, payload) {
  if (ackId === null || ackId === undefined) {
    return '2' + JSON.stringify([event, payload]);
  }
  return '2' + String(ackId) + JSON.stringify([event, payload]);
}

/**
 * @param {import('./config.js').K6Config} c
 * @param {{ accessToken: string, userId: string }} user
 * @param {(s: SioSession) => void} onReady
 * @param {(err: Error) => void} onError
 * @param {{ eventListeners?: Map<string, (data: unknown) => void> }} [opts]
 * @returns {void}
 */
function openSioSession(c, user, onReady, onError, opts) {
  const fail = (/** @type {Error} */ err) => {
    sioConnectFailures.add(1);
    onError(err);
  };
  const url = toEngineWsUrl(c.wsUrl);
  const tConnectStart = Date.now();
  const auth = {
    token: user.accessToken,
    userId: String(user.userId),
  };
  const pendingAcks = /** @type {Record<number, (data: unknown) => void>} */ ({});
  let nextAckId = 0;
  const listeners =
    opts && opts.eventListeners
      ? opts.eventListeners
      : new /** @type {Map<string, (data: unknown) => void>} */ (Map());
  let sentConnect = false;
  let sioUp = false;

  /** @type {SioSession} */
  const session = {
    _ws: null,
    sendEventWithAck(event, payload, ack) {
      const id = nextAckId++;
      pendingAcks[id] = ack;
      if (this._ws) {
        this._ws.send(wrapEngine(encodeEvent(id, event, payload)));
      }
    },
    sendEventNoAck(event, payload) {
      if (this._ws) {
        this._ws.send(wrapEngine(encodeEvent(null, event, payload)));
      }
    },
    on(event, fn) {
      listeners.set(event, fn);
    },
    close() {
      try {
        if (this._ws) {
          this._ws.close();
        }
      } catch {
        // ignore
      }
    },
  };

  /**
   * @param {string} data
   */
  function processSocketPacket(data) {
    const p = parseInnerPacket(data);
    if (!p) {
      return;
    }
    if (p.type === 0 && sentConnect) {
      if (!sioUp) {
        sioUp = true;
        sioConnectMs.add(Date.now() - tConnectStart);
        onReady(session);
      }
      return;
    }
    if (p.type === 2) {
      const arr = p.data;
      if (!Array.isArray(arr) || arr.length < 1) {
        return;
      }
      const eventName = String(arr[0]);
      const payload = arr.length > 1 ? arr[1] : undefined;
      const h = listeners.get(eventName);
      if (h) {
        h(payload);
      }
      return;
    }
    if (p.type === 3 && p.id != null) {
      const fn = pendingAcks[p.id];
      if (fn) {
        delete pendingAcks[p.id];
        const raw = p.data;
        const arg = Array.isArray(raw) && raw.length ? raw[0] : raw;
        fn(arg);
      }
      return;
    }
    if (p.type === 4) {
      fail(new Error('socket.io connect_error: ' + JSON.stringify(p.data)));
    }
  }

  /**
   * @param {string} raw
   */
  function onEngineData(raw) {
    if (!raw || raw.length < 1) {
      return;
    }
    const e = raw[0];
    if (e === '0') {
      if (!sentConnect) {
        sentConnect = true;
        if (session._ws) {
          session._ws.send(wrapEngine(encodeNamespaceConnect(auth)));
        }
      }
      return;
    }
    if (e === '1') {
      fail(new Error('engine close'));
      return;
    }
    if (e === '2') {
      if (raw.length === 1) {
        if (session._ws) {
          session._ws.send('3');
        }
      } else if (session._ws) {
        session._ws.send('3' + raw.slice(1));
      }
      return;
    }
    if (e === '3') {
      return;
    }
    if (e === '4') {
      processSocketPacket(raw.slice(1));
    }
  }

  const socket = new WebSocket(url);
  session._ws = socket;
  socket.addEventListener('error', () => {
    fail(new Error('websocket error'));
  });
  socket.addEventListener('message', (ev) => {
    const d = ev.data;
    if (typeof d === 'string') {
      onEngineData(d);
    } else {
      fail(new Error('binary not supported'));
    }
  });
}

/**
 * @typedef {Object} SioSession
 * @property {WebSocket | null} _ws
 * @property {(event: string, payload: unknown, ack: (data: unknown) => void) => void} sendEventWithAck
 * @property {(event: string, payload: unknown) => void} sendEventNoAck
 * @property {(event: string, fn: (data: unknown) => void) => void} on
 * @property {() => void} close
 */

/**
 * @param {string} baseUrl
 */
export function getHealthPath(baseUrl) {
  return `${baseUrl}/health`;
}

/**
 * Text-only **`message:send`** body: JSON metadata for load correlation + optional space padding
 * for a simple **byte-size distribution** (primary runs: `K6_TEXT_BODY_PAD_MAX_BYTES=0`, small body).
 * Media / S3 presign is **out of scope** in k6 — use **`MEDIA_RATIO`** for an optional *delay* tranche only.
 *
 * @param {import('./config.js').K6Config} c
 * @param {number} tEmit
 * @param {number} burstI
 * @param {number} burstN
 * @returns {string}
 */
function buildK6TextMessageBody(c, tEmit, burstI, burstN) {
  let lo = c.textBodyPadMinBytes;
  let hi = c.textBodyPadMaxBytes;
  if (lo > hi) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  /** @type {Record<string, unknown>} */
  const o = {
    t: tEmit,
    runId: c.runId,
    // eslint-disable-next-line no-undef
    vu: typeof __VU !== 'undefined' ? __VU : 0,
    // eslint-disable-next-line no-undef
    iter: typeof __ITER !== 'undefined' ? __ITER : 0,
    b: burstI,
    burst: burstN,
  };
  if (hi > 0) {
    const span = hi - lo;
    const n = lo + (span > 0 ? Math.floor(Math.random() * (span + 1)) : 0);
    o.pad = ' '.repeat(n);
  }
  return JSON.stringify(o);
}

/**
 * @param {import('./config.js').K6Config} c
 * @param {{ accessToken: string, userId: string }} a
 * @param {{ accessToken: string, userId: string }} b
 * @param {() => void} onDone
 */
function runPairedSioIdle(c, a, b, onDone) {
  /** @type {SioSession | null} */
  let sB = null;
  /** @type {SioSession | null} */
  let sA = null;
  let finished = false;
  let gaugeAdds = 0;
  const bumpConnectedGauge = () => {
    connectedSockets.add(1);
    gaugeAdds++;
  };
  const end = () => {
    if (finished) {
      return;
    }
    finished = true;
    if (gaugeAdds) {
      connectedSockets.add(-gaugeAdds);
      gaugeAdds = 0;
    }
    if (sA) {
      sA.close();
    }
    if (sB) {
      sB.close();
    }
    onDone();
  };
  const noop = new Map();
  openSioSession(
    c,
    b,
    (readyB) => {
      sB = readyB;
      bumpConnectedGauge();
      openSioSession(
        c,
        a,
        (readyA) => {
          sA = readyA;
          bumpConnectedGauge();
          check(null, { 'idle: both sockets up': () => true });
          sleep(c.idleHoldSec);
          end();
        },
        () => {
          if (!finished) {
            check(null, { 'sio A connect (idle)': () => false });
            end();
          }
        },
        { eventListeners: noop },
      );
    },
    () => {
      if (!finished) {
        check(null, { 'sio B connect (idle)': () => false });
        end();
      }
    },
    { eventListeners: noop },
  );
}

/**
 * @param {import('./config.js').K6Config} c
 * @param {{ accessToken: string, userId: string }} a
 * @param {{ accessToken: string, userId: string }} b
 * @param {() => void} onDone
 */
function runPairedSio1to1(c, a, b, onDone) {
  const receiptMode = (c.receiptMode || 'full').toLowerCase();
  const modeNone = receiptMode === 'none' || receiptMode === 'off';
  const modeDeliveredOnly = receiptMode === 'delivered_only';
  const modeFull =
    (receiptMode === 'full' || receiptMode === '') && !modeNone;
  const burstN = c.burstCount;
  const rdMs = c.receiptReadDelayMs;
  const cdMs = c.receiptConversationDelayMs;

  /** Success-path ack end time (ms) by message id — §1.4 start for `e2e_message_new_ms`. */
  const tAckEndById = /** @type {Record<string, number>} */ ({});
  /** Recipient `message:new` time by id — §1.5 start for receipt E2E to sender. */
  const bNewAt = /** @type {Record<string, number>} */ ({});
  const seenMessageIds = new Set();

  /** @type {SioSession | null} */
  let sB = null;
  /** @type {SioSession | null} */
  let sA = null;
  let finished = false;
  let completedInbound = 0;
  let gaugeAdds = 0;
  const bumpConnectedGauge = () => {
    connectedSockets.add(1);
    gaugeAdds++;
  };

  const end = () => {
    if (finished) {
      return;
    }
    finished = true;
    if (gaugeAdds) {
      connectedSockets.add(-gaugeAdds);
      gaugeAdds = 0;
    }
    if (sA) {
      sA.close();
    }
    if (sB) {
      sB.close();
    }
    onDone();
  };

  /**
   * @param {Record<string, unknown>} msg
   */
  function maybeEndReceiptChain(msg) {
    completedInbound++;
    if (completedInbound >= burstN) {
      check(
        { burst: burstN, received: completedInbound },
        { 'burst inbound count': () => true },
      );
      end();
    } else {
      void msg;
    }
  }

  const aListeners = new Map();
  aListeners.set('message:delivered', (payload) => {
    if (finished) {
      return;
    }
    const p = /** @type {Record<string, unknown>} */ (
      payload != null && typeof payload === 'object' ? payload : {}
    );
    const messageId = typeof p.messageId === 'string' ? p.messageId : '';
    const t0 = messageId ? bNewAt[messageId] : undefined;
    if (messageId && t0 != null) {
      e2eDeliveredToSenderMs.add(Date.now() - t0);
    }
  });
  aListeners.set('message:read', (payload) => {
    if (finished) {
      return;
    }
    const p = /** @type {Record<string, unknown>} */ (
      payload != null && typeof payload === 'object' ? payload : {}
    );
    const messageId = typeof p.messageId === 'string' ? p.messageId : '';
    const t0 = messageId ? bNewAt[messageId] : undefined;
    if (messageId && t0 != null) {
      e2eReadToSenderMs.add(Date.now() - t0);
    }
  });
  aListeners.set('conversation:read', (payload) => {
    if (finished) {
      return;
    }
    const p = /** @type {Record<string, unknown>} */ (
      payload != null && typeof payload === 'object' ? payload : {}
    );
    const messageId = typeof p.messageId === 'string' ? p.messageId : '';
    const t0 = messageId ? bNewAt[messageId] : undefined;
    if (messageId && t0 != null) {
      e2eConversationReadToSenderMs.add(Date.now() - t0);
    }
  });

  const bListeners = new Map();
  bListeners.set('message:new', (payload) => {
    if (finished) {
      return;
    }
    const msg = /** @type {Record<string, unknown>} */ (payload);
    const messageId = typeof msg.id === 'string' ? msg.id : '';
    if (messageId) {
      if (seenMessageIds.has(messageId)) {
        duplicateMessageNewTotal.add(1);
      } else {
        seenMessageIds.add(messageId);
      }
    }
    const tAck = messageId ? tAckEndById[messageId] : undefined;
    if (messageId && tAck != null) {
      e2eMessageNewMs.add(Date.now() - tAck);
    }
    if (messageId) {
      bNewAt[messageId] = Date.now();
    }
    if (modeNone) {
      check(msg, { 'message:new has id': (m) => typeof m.id === 'string' });
      maybeEndReceiptChain(msg);
      return;
    }
    const conversationId =
      typeof msg.conversationId === 'string' ? msg.conversationId : '';
    if (!messageId || !conversationId) {
      if (!finished) {
        end();
      }
      return;
    }
    if (!sB) {
      end();
      return;
    }
    const t0Delivered = Date.now();
    sB.sendEventWithAck('message:delivered', { messageId, conversationId }, () => {
      receiptEmitToAckMs.add(Date.now() - t0Delivered);
      receiptEventsTotal.add(1);
      if (modeDeliveredOnly) {
        check(msg, { 'receipts delivered path': () => true });
        maybeEndReceiptChain(msg);
        return;
      }
      if (modeFull) {
        sleep(rdMs / 1000);
        const t0Read = Date.now();
        sB.sendEventWithAck('message:read', { messageId, conversationId }, () => {
          receiptEmitToAckMs.add(Date.now() - t0Read);
          receiptEventsTotal.add(1);
          if (cdMs > 0) {
            sleep(cdMs / 1000);
          }
          const t0Conv = Date.now();
          sB &&
            sB.sendEventWithAck('conversation:read', { messageId, conversationId }, () => {
              receiptEmitToAckMs.add(Date.now() - t0Conv);
              receiptEventsTotal.add(1);
              check(msg, { 'receipts full path': () => true });
              maybeEndReceiptChain(msg);
            });
        });
        return;
      }
      if (!finished) {
        end();
      }
    });
  });

  openSioSession(
    c,
    b,
    (readyB) => {
      sB = readyB;
      bumpConnectedGauge();
      openSioSession(
        c,
        a,
        (readyA) => {
          sA = readyA;
          bumpConnectedGauge();
          let burstI = 0;
          const sendOneBurst = () => {
            if (finished || !sA) {
              return;
            }
            if (burstI >= burstN) {
              return;
            }
            const tEmit = Date.now();
            const body = buildK6TextMessageBody(c, tEmit, burstI, burstN);
            sA.sendEventWithAck(
              'message:send',
              { recipientUserId: String(b.userId), body },
              (ack) => {
                if (finished) {
                  return;
                }
                const obj = /** @type {Record<string, unknown>} */ (
                  ack && typeof ack === 'object' ? ack : {}
                );
                const lat = Date.now() - tEmit;
                if (obj.code) {
                  messageSendAckErrMs.add(lat);
                  sioMessageSendErrorRate.add(1);
                  check(obj, { 'message:send no error code in ack': () => false });
                  end();
                  return;
                }
                messageSendAckOkMs.add(lat);
                sioMessageSendErrorRate.add(0);
                msgSendAckedTotal.add(1);
                check(obj, {
                  'ack has message id': (o) => typeof o.id === 'string',
                });
                const mid = typeof obj.id === 'string' ? obj.id : '';
                if (mid) {
                  tAckEndById[mid] = Date.now();
                }
                burstI++;
                if (burstI < burstN) {
                  sleep(c.burstInnerSec);
                  sendOneBurst();
                }
              },
            );
          };
          sendOneBurst();
        },
        () => {
          if (!finished) {
            check(null, { 'sio A connect': () => false });
            end();
          }
        },
        { eventListeners: aListeners },
      );
    },
    () => {
      if (!finished) {
        check(null, { 'sio B connect': () => false });
        end();
      }
    },
    { eventListeners: bListeners },
  );
}

/**
 * 1:1: open B → A → burst `message:send` / receipts; or **idle** = connect both, `sleep(idleHoldSec)`, close.
 * @param {import('./config.js').K6Config} c
 * @param {string} accessTokenA
 * @param {string} userIdA
 * @param {string} accessTokenB
 * @param {string} userIdB
 * @param {{ idle?: boolean }} [opts]
 */
export function runOneToOneSocketLifecycle(
  c,
  accessTokenA,
  userIdA,
  accessTokenB,
  userIdB,
  opts,
) {
  runSendOrStub(
    c,
    { accessToken: accessTokenA, userId: userIdA },
    { accessToken: accessTokenB, userId: userIdB },
    opts,
  );
}

/**
 * @param {import('./config.js').K6Config} c
 * @param {string} accessToken
 * @param {string} userId
 */
export function stubMessageSend(c, accessToken, userId) {
  sioNotImplemented.add(1, { stub: 'message_send' });
  void c;
  void accessToken;
  void userId;
}

/**
 * @param {import('./config.js').K6Config} c
 * @param {{ accessToken: string, userId: string }} userA
 * @param {{ accessToken: string, userId: string }} userB
 * @param {{ idle?: boolean }} [options]
 */
export function runSendOrStub(c, userA, userB, options) {
  const idle = Boolean(options && options.idle);
  let done = false;
  if (idle) {
    runPairedSioIdle(
      c,
      userA,
      userB,
      () => {
        done = true;
      },
    );
  } else {
    runPairedSio1to1(
      c,
      userA,
      userB,
      () => {
        done = true;
      },
    );
  }
  const t0 = Date.now();
  const maxWait = idle
    ? Math.max(c.sioMaxWaitMs, c.idleHoldSec * 1000 + 20_000)
    : c.sioMaxWaitMs;
  // eslint-disable-next-line no-undef
  while (!done && Date.now() - t0 < maxWait) {
    sleep(0.05);
  }
  if (!done && !idle) {
    droppedMessagesTotal.add(c.burstCount);
  }
}
