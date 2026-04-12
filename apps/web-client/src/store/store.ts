import { configureStore } from '@reduxjs/toolkit';
import { appReducer } from '../modules/app/stores/appSlice';
import { authReducer } from '../modules/auth/stores/authSlice';
import { cryptoReducer } from '../modules/crypto/stores/cryptoSlice';

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
    crypto: cryptoReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware(),
  // Append custom middleware with `.concat(myMiddleware)` when needed (analytics, RTK Query, etc.).
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
