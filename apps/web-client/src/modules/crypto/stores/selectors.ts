import { createSelector } from '@reduxjs/toolkit';
import type { DeviceSyncRequestedPayload } from '../../../common/realtime/socketWorkerProtocol';
import type { RootState } from '../../../store/store';

export const selectCrypto = (state: RootState) => state.crypto;

export const selectPublicKeyRegistered = (state: RootState) =>
  state.crypto.registeredOnServer;

export const selectPublicKeyVersion = (state: RootState) =>
  state.crypto.keyVersion;

export const selectMessagingDeviceId = (state: RootState) =>
  state.crypto.deviceId;

export const selectPublicKeyUploadStatus = (state: RootState) =>
  state.crypto.status;

export const selectPublicKeyUploadError = (state: RootState) =>
  state.crypto.error;

export const selectPublicKeyLastUpdatedAt = (state: RootState) =>
  state.crypto.lastUpdatedAt;

export const selectRegisteredPublicKeySpki = (state: RootState) =>
  state.crypto.registeredPublicKeySpki;

export const selectSyncState = (state: RootState) => state.crypto.syncState;

/**
 * When a **trusted** session should show the device-sync approval UI, returns the same shape as the
 * Socket.IO **`device:sync_requested`** payload; otherwise **`null`**. Memoized so **`useSelector`** does not
 * see a new object reference on every call.
 */
export const selectPendingSync = createSelector(
  [
    (state: RootState) => state.crypto.pendingSyncFromDeviceId,
    (state: RootState) => state.crypto.pendingSyncFromDevicePublicKey,
  ],
  (id, pk): DeviceSyncRequestedPayload | null => {
    const tid = id?.trim() ?? '';
    const tpk = pk?.trim() ?? '';
    if (tid.length === 0 || tpk.length === 0) {
      return null;
    }
    return { newDeviceId: tid, newDevicePublicKey: tpk };
  },
);

export const selectSyncCompletedForNewDeviceId = (state: RootState) =>
  state.crypto.syncCompletedForNewDeviceId;
