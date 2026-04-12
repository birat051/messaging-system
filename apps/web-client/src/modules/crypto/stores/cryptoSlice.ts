import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { components } from '../../../generated/api-types';
import { putMyPublicKey, rotateMyPublicKey } from '../../../common/api/usersApi';
import { retryAsync } from '../../../common/utils/retryAsync';
import { parseApiError } from '../../auth/utils/apiError';
import { logout } from '../../auth/stores/authSlice';

type UserPublicKeyResponse = components['schemas']['UserPublicKeyResponse'];
type PutPublicKeyRequest = components['schemas']['PutPublicKeyRequest'];
type RotatePublicKeyRequest = components['schemas']['RotatePublicKeyRequest'];

export type CryptoState = {
  /** True after a successful **PUT** / **POST rotate** in this session (or until logout). */
  keyRegistered: boolean;
  keyVersion: number | null;
  /** Last registered public key (SPKI Base64) from a successful **PUT** / **rotate** response. */
  registeredPublicKeySpki: string | null;
  lastUpdatedAt: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: CryptoState = {
  keyRegistered: false,
  keyVersion: null,
  registeredPublicKeySpki: null,
  lastUpdatedAt: null,
  status: 'idle',
  error: null,
};

export const uploadPublicKey = createAsyncThunk<
  UserPublicKeyResponse,
  PutPublicKeyRequest,
  { rejectValue: string }
>('crypto/uploadPublicKey', async (body, { rejectWithValue }) => {
  try {
    return await retryAsync(() => putMyPublicKey(body));
  } catch (e) {
    return rejectWithValue(parseApiError(e).message);
  }
});

export const rotatePublicKey = createAsyncThunk<
  UserPublicKeyResponse,
  RotatePublicKeyRequest,
  { rejectValue: string }
>('crypto/rotatePublicKey', async (body, { rejectWithValue }) => {
  try {
    return await retryAsync(() => rotateMyPublicKey(body));
  } catch (e) {
    return rejectWithValue(parseApiError(e).message);
  }
});

function applySuccess(
  state: CryptoState,
  action: PayloadAction<UserPublicKeyResponse>,
): void {
  state.status = 'succeeded';
  state.error = null;
  state.keyRegistered = true;
  state.keyVersion = action.payload.keyVersion;
  state.registeredPublicKeySpki = action.payload.publicKey;
  state.lastUpdatedAt = action.payload.updatedAt;
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
    /** Sync local knowledge when server state is loaded elsewhere (e.g. future **GET** me). */
    setPublicKeyMeta(
      state,
      action: PayloadAction<{
        keyVersion: number;
        updatedAt: string;
        publicKey?: string;
      } | null>,
    ) {
      if (action.payload === null) {
        state.keyRegistered = false;
        state.keyVersion = null;
        state.registeredPublicKeySpki = null;
        state.lastUpdatedAt = null;
        return;
      }
      state.keyRegistered = true;
      state.keyVersion = action.payload.keyVersion;
      state.lastUpdatedAt = action.payload.updatedAt;
      if (action.payload.publicKey !== undefined) {
        state.registeredPublicKeySpki = action.payload.publicKey;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logout, () => ({ ...initialState }));
    builder
      .addCase(uploadPublicKey.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(uploadPublicKey.fulfilled, (state, action) => {
        applySuccess(state, action);
      })
      .addCase(uploadPublicKey.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.payload ??
          action.error.message ??
          'Failed to register public key';
      });
    builder
      .addCase(rotatePublicKey.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(rotatePublicKey.fulfilled, (state, action) => {
        applySuccess(state, action);
      })
      .addCase(rotatePublicKey.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.payload ??
          action.error.message ??
          'Failed to rotate public key';
      });
  },
});

export const { clearCryptoError, setPublicKeyMeta } = cryptoSlice.actions;
export const { reducer: cryptoReducer } = cryptoSlice;
