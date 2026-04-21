import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { components } from '../../../generated/api-types';
import type { DeviceSyncRequestedPayload } from '../../../common/realtime/socketWorkerProtocol';
import { registerMyDevice } from '../../../common/api/usersApi';
import { retryAsync } from '../../../common/utils/retryAsync';
import { parseApiError } from '../../auth/utils/apiError';
import { logout } from '../../auth/stores/authSlice';

type RegisterDeviceRequest = components['schemas']['RegisterDeviceRequest'];
type RegisterDeviceResponse = components['schemas']['RegisterDeviceResponse'];

/** Multi-device message-key sync UX — **`in_progress`** / **`complete`** reserved for orchestration UI. */
export type CryptoSyncState =
  | 'idle'
  | 'pending'
  | 'in_progress'
  | 'complete';

export type CryptoState = {
  /** True after a successful **`POST /users/me/devices`** in this session (or until logout). */
  registeredOnServer: boolean;
  keyVersion: number | null;
  /**
   * Opaque id from **`POST /users/me/devices`** (or **`'default'`** for legacy single-key rows).
   * Also hydrated from **IndexedDB** (`deviceIdentity` in **`privateKeyStorage`**) on session restore before **`registerDevice`** runs.
   */
  deviceId: string | null;
  /** Last registered public key (SPKI Base64) from a successful device registration response. */
  registeredPublicKeySpki: string | null;
  lastUpdatedAt: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  /**
   * **`pending`** — this **`deviceId`** has no wrapped keys on the first sync page while **another** device row exists
   * (new device awaiting trusted-device sync). See **`evaluateDeviceSyncBootstrapState`**.
   */
  syncState: CryptoSyncState;
  /**
   * Set when Socket.IO **`device:sync_requested`** arrives on a **trusted** session (another device registered).
   * Cleared by **`syncDismissed`**, **`syncCompleted`**, **`logout`**.
   */
  pendingSyncFromDeviceId: string | null;
  pendingSyncFromDevicePublicKey: string | null;
  /**
   * After **`executeApproveDeviceKeySync`** finishes on this device, the **`newDeviceId`** keys were re-wrapped for.
   * Cleared on the next **`syncRequested`**, **`setPublicKeyMeta(null)`**, **`logout`**.
   */
  syncCompletedForNewDeviceId: string | null;
};

const initialState: CryptoState = {
  registeredOnServer: false,
  keyVersion: null,
  deviceId: null,
  registeredPublicKeySpki: null,
  lastUpdatedAt: null,
  status: 'idle',
  error: null,
  syncState: 'idle',
  pendingSyncFromDeviceId: null,
  pendingSyncFromDevicePublicKey: null,
  syncCompletedForNewDeviceId: null,
};

export const registerDevice = createAsyncThunk<
  RegisterDeviceResponse,
  RegisterDeviceRequest,
  { rejectValue: string }
>('crypto/registerDevice', async (body, { rejectWithValue }) => {
  try {
    return await retryAsync(() => registerMyDevice(body));
  } catch (e) {
    return rejectWithValue(parseApiError(e).message);
  }
});

function applyDeviceRegistered(
  state: CryptoState,
  payload: RegisterDeviceResponse,
): void {
  state.status = 'succeeded';
  state.error = null;
  state.registeredOnServer = true;
  state.deviceId = payload.deviceId;
  state.keyVersion = payload.keyVersion;
  state.registeredPublicKeySpki = payload.publicKey;
  state.lastUpdatedAt = payload.updatedAt;
}

const cryptoSlice = createSlice({
  name: 'crypto',
  initialState,
  reducers: {
    clearCryptoError(state) {
      state.error = null;
      if (state.status === 'failed') {
        state.status = 'idle';
      }
    },
    setSyncState(state, action: PayloadAction<CryptoSyncState>) {
      state.syncState = action.payload;
    },
    /**
     * Apply **`deviceId`** read from **IndexedDB** after sign-in so **`crypto.deviceId`** is available before
     * **`ensureUserKeypairReadyForMessaging`** may call **`registerDevice`**.
     */
    hydrateMessagingDeviceId(state, action: PayloadAction<string>) {
      const t = action.payload.trim();
      if (t.length > 0) {
        state.deviceId = t;
      }
    },
    deviceRegistered(state, action: PayloadAction<RegisterDeviceResponse>) {
      applyDeviceRegistered(state, action.payload);
    },
    syncRequested(state, action: PayloadAction<DeviceSyncRequestedPayload>) {
      state.pendingSyncFromDeviceId = action.payload.newDeviceId.trim();
      state.pendingSyncFromDevicePublicKey =
        action.payload.newDevicePublicKey.trim();
      state.syncCompletedForNewDeviceId = null;
    },
    syncStarted(state) {
      if (state.syncState === 'pending') {
        state.syncState = 'in_progress';
      }
    },
    syncDismissed(state) {
      state.pendingSyncFromDeviceId = null;
      state.pendingSyncFromDevicePublicKey = null;
    },
    syncCompleted(state, action: PayloadAction<{ newDeviceId: string }>) {
      state.pendingSyncFromDeviceId = null;
      state.pendingSyncFromDevicePublicKey = null;
      const id = action.payload.newDeviceId.trim();
      state.syncCompletedForNewDeviceId = id.length > 0 ? id : null;
    },
    /** Sync local knowledge when server state is loaded elsewhere (e.g. **`ensureUserKeypairReadyForMessaging`**). */
    setPublicKeyMeta(
      state,
      action: PayloadAction<{
        keyVersion: number;
        updatedAt: string;
        publicKey?: string;
        deviceId?: string | null;
      } | null>,
    ) {
      if (action.payload === null) {
        state.registeredOnServer = false;
        state.keyVersion = null;
        state.deviceId = null;
        state.registeredPublicKeySpki = null;
        state.lastUpdatedAt = null;
        state.syncState = 'idle';
        state.pendingSyncFromDeviceId = null;
        state.pendingSyncFromDevicePublicKey = null;
        state.syncCompletedForNewDeviceId = null;
        return;
      }
      state.registeredOnServer = true;
      state.keyVersion = action.payload.keyVersion;
      state.lastUpdatedAt = action.payload.updatedAt;
      if (action.payload.publicKey !== undefined) {
        state.registeredPublicKeySpki = action.payload.publicKey;
      }
      if (action.payload.deviceId !== undefined) {
        state.deviceId = action.payload.deviceId;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logout, () => ({ ...initialState }));
    builder
      .addCase(registerDevice.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerDevice.fulfilled, (state, action) => {
        applyDeviceRegistered(state, action.payload);
      })
      .addCase(registerDevice.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.payload ??
          action.error.message ??
          'Failed to register device';
      });
  },
});

export const {
  clearCryptoError,
  setPublicKeyMeta,
  setSyncState,
  hydrateMessagingDeviceId,
  deviceRegistered,
  syncRequested,
  syncStarted,
  syncDismissed,
  syncCompleted,
} = cryptoSlice.actions;
export const { reducer: cryptoReducer } = cryptoSlice;
