import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { components } from '../../generated/api-types';

export type User = components['schemas']['User'];

/** Access token lives in memory only; refresh token is in **`localStorage`** (`authStorage.ts`). */
export type AuthState = {
  user: User | null;
  accessToken: string | null;
};

const initialState: AuthState = {
  user: null,
  accessToken: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(
      state,
      action: PayloadAction<{
        user: User | null;
        accessToken: string | null;
      }>,
    ) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
    },
  },
});

export const { setSession, setUser, logout } = authSlice.actions;
export const { reducer: authReducer } = authSlice;
