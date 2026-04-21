import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import { listUserDevicePublicKeys } from '@/common/api/usersApi';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { logout } from '@/modules/auth/stores/authSlice';
import type { HybridDeviceRow } from '@/common/crypto/messageHybrid';
import { registerDevice } from './cryptoSlice';
import type { RootState } from '../../../store/store';

/** Default TTL for **`GET /users/:id/devices/public-keys`** cache (per user id, including **`'me'`**). */
export const DEVICE_PUBLIC_KEYS_CACHE_TTL_MS = 120_000;

export type DevicePublicKeysEntry = {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  items: HybridDeviceRow[];
  /** **403** from the directory — treat as **no** hybrid rows (hybrid send/decrypt unavailable for that user). */
  forbidden: boolean;
  error: string | null;
  cachedAtMs: number | null;
};

export type DevicePublicKeysState = {
  byUserId: Record<string, DevicePublicKeysEntry>;
};

export const devicePublicKeysInitialState: DevicePublicKeysState = {
  byUserId: {},
};

function emptyEntry(overrides: Partial<DevicePublicKeysEntry> = {}): DevicePublicKeysEntry {
  return {
    status: 'idle',
    items: [],
    forbidden: false,
    error: null,
    cachedAtMs: null,
    ...overrides,
  };
}

export function isDevicePublicKeysCacheFresh(
  entry: DevicePublicKeysEntry | undefined,
  now = Date.now(),
): boolean {
  return (
    entry?.status === 'succeeded' &&
    entry.cachedAtMs != null &&
    now - entry.cachedAtMs < DEVICE_PUBLIC_KEYS_CACHE_TTL_MS
  );
}

export type FetchDevicePublicKeysResult = {
  userId: string;
  items: HybridDeviceRow[];
  forbidden: boolean;
};

export const fetchDevicePublicKeys = createAsyncThunk<
  FetchDevicePublicKeysResult,
  string,
  { state: RootState; rejectValue: string }
>(
  'devicePublicKeys/fetch',
  async (userId, { rejectWithValue }) => {
    const key = userId.trim();
    if (!key) {
      return rejectWithValue('userId is required');
    }
    try {
      const res = await listUserDevicePublicKeys(key);
      return {
        userId: key,
        items: res.items.map((i) => ({
          deviceId: i.deviceId,
          publicKey: i.publicKey,
        })),
        forbidden: false,
      };
    } catch (e) {
      const p = parseApiError(e);
      if (p.httpStatus === 403) {
        return { userId: key, items: [], forbidden: true };
      }
      return rejectWithValue(
        p.message ||
          (p.httpStatus === 404
            ? 'User or device keys were not found.'
            : 'Failed to load device public keys.'),
      );
    }
  },
);

const devicePublicKeysSlice = createSlice({
  name: 'devicePublicKeys',
  initialState: devicePublicKeysInitialState,
  reducers: {
    /**
     * Drop cached rows so the next **`fetchDevicePublicKeys`** hits the network.
     * Omit **`userId`** to clear **all** users (e.g. after account switch debugging).
     */
    invalidateDevicePublicKeys(state, action: PayloadAction<string | undefined>) {
      const id = action.payload?.trim();
      if (!id) {
        state.byUserId = {};
        return;
      }
      delete state.byUserId[id];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logout, () => ({ ...devicePublicKeysInitialState }));
    builder.addCase(registerDevice.fulfilled, (state) => {
      delete state.byUserId.me;
    });
    builder
      .addCase(fetchDevicePublicKeys.pending, (state, action) => {
        const key = action.meta.arg.trim();
        const prev = state.byUserId[key];
        state.byUserId[key] = emptyEntry({
          status: 'loading',
          items: prev?.items ?? [],
          forbidden: prev?.forbidden ?? false,
        });
      })
      .addCase(fetchDevicePublicKeys.fulfilled, (state, action) => {
        const { userId, items, forbidden } = action.payload;
        state.byUserId[userId] = {
          status: 'succeeded',
          items,
          forbidden,
          error: null,
          cachedAtMs: Date.now(),
        };
      })
      .addCase(fetchDevicePublicKeys.rejected, (state, action) => {
        const key = action.meta.arg.trim();
        const msg =
          action.payload ??
          action.error.message ??
          'Failed to load device public keys';
        state.byUserId[key] = emptyEntry({
          status: 'failed',
          error: msg,
        });
      });
  },
});

export const { invalidateDevicePublicKeys } = devicePublicKeysSlice.actions;
export const { reducer: devicePublicKeysReducer } = devicePublicKeysSlice;

export function selectDevicePublicKeysEntry(
  state: RootState,
  userId: string,
): DevicePublicKeysEntry | undefined {
  return state.devicePublicKeys.byUserId[userId.trim()];
}
