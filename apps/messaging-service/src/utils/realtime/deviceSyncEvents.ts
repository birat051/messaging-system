import { getMessagingSocketIoServer } from '../../data/messaging/rabbitmq.js';
import { logger } from '../logger.js';

export type DeviceSyncRequestedPayload = {
  newDeviceId: string;
  newDevicePublicKey: string;
};

export type DeviceSyncCompletePayload = {
  targetDeviceId: string;
};

/**
 * Same-user, in-process fan-out (no RabbitMQ). Notifies other tabs / devices joined to **`user:<userId>`**.
 */
export function emitDeviceSyncRequested(params: {
  userId: string;
  newDeviceId: string;
  newDevicePublicKey: string;
}): void {
  const io = getMessagingSocketIoServer();
  if (!io) {
    logger.debug(
      { userId: params.userId },
      'device:sync_requested skipped (Socket.IO server not registered)',
    );
    return;
  }
  const payload: DeviceSyncRequestedPayload = {
    newDeviceId: params.newDeviceId,
    newDevicePublicKey: params.newDevicePublicKey,
  };
  io.to(`user:${params.userId}`).emit('device:sync_requested', payload);
}

/**
 * Notifies **`user:<userId>`** tabs — the **new device** (`targetDeviceId`) should re-fetch message lists after
 * **`POST /users/me/sync/message-keys`** applied at least one wrapped key.
 */
export function emitDeviceSyncComplete(params: {
  userId: string;
  targetDeviceId: string;
}): void {
  const io = getMessagingSocketIoServer();
  if (!io) {
    logger.debug(
      { userId: params.userId },
      'device:sync_complete skipped (Socket.IO server not registered)',
    );
    return;
  }
  const targetDeviceId = params.targetDeviceId.trim();
  if (targetDeviceId.length === 0) {
    return;
  }
  const payload: DeviceSyncCompletePayload = { targetDeviceId };
  io.to(`user:${params.userId}`).emit('device:sync_complete', payload);
}
