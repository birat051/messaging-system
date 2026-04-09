import { configureStore } from '@reduxjs/toolkit';
import { appReducer } from '../modules/app/stores/appSlice';
import { authReducer } from '../modules/auth/stores/authSlice';

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware(),
  // Append custom middleware with `.concat(myMiddleware)` when needed (analytics, RTK Query, etc.).
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
