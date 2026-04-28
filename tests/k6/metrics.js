/**
 * Custom k6 metrics — names match **[`docs/scalability-methodology.md`](../../docs/scalability-methodology.md)** §1 where noted.
 * @file
 */
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';

// §1.1
export const sioConnectMs = new Trend('sio_connect_ms', true);
export const sioConnectFailures = new Counter('sio_connect_failures');

// §1.2 (refresh also timed in auth.js)
export const httpAuthLoginMs = new Trend('http_auth_login_ms', true);
export const httpAuthRefreshMs = new Trend('http_auth_refresh_ms', true);
export const httpAuthLoginFailures = new Counter('http_auth_login_failures_total');
export const httpAuthRefreshFailures = new Counter('http_auth_refresh_failures_total');

export const http5xx = new Rate('http_5xx');

// §1.3
export const messageSendAckOkMs = new Trend('message_send_ack_ok_ms', true);
export const messageSendAckErrMs = new Trend('message_send_ack_err_ms', true);
/** Per `message:send` attempt: 1 = ack had `code` (error shape), 0 = success `Message`. */
export const sioMessageSendErrorRate = new Rate('sio_message_send_error_rate');

// §1.4
export const e2eMessageNewMs = new Trend('e2e_message_new_ms', true);

// §1.5 (optional / when receipts fire)
export const e2eDeliveredToSenderMs = new Trend('e2e_delivered_to_sender_ms', true);
export const e2eReadToSenderMs = new Trend('e2e_read_to_sender_ms', true);
export const e2eConversationReadToSenderMs = new Trend(
  'e2e_conversation_read_to_sender_ms',
  true,
);
/** Recipient emit with server ack — harness-only (§1.5 `receipt_emit_to_ack_ms`). */
export const receiptEmitToAckMs = new Trend('receipt_emit_to_ack_ms', true);

// §1.6 — RPS from summary: `msg_send_acked_total / test_duration`; receipt rate from `receipt_events_total`
export const msgSendAckedTotal = new Counter('msg_send_acked_total');
export const receiptEventsTotal = new Counter('receipt_events_total');
export const connectedSockets = new Gauge('connected_sockets');

// §1.9
export const reconnectsTotal = new Counter('reconnects_total');

// §1.10
export const droppedMessagesTotal = new Counter('dropped_messages_total');
export const duplicateMessageNewTotal = new Counter('duplicate_message_new_total');

// Stub / not implemented
export const sioNotImplemented = new Counter('sio_stubs_total');
