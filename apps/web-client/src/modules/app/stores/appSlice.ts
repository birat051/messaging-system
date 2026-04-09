import { createSlice } from '@reduxjs/toolkit';

/**
 * Shell-level **`app`** slice (non-feature routes). Registered in **`src/store/store.ts`** alongside **`modules/auth/stores`**.
 */
export type AppState = {
  bootstrapped: boolean;
};

const initialState: AppState = {
  bootstrapped: true,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {},
});

export const { reducer: appReducer } = appSlice;
