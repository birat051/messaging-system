import { configureStore } from '@reduxjs/toolkit';
import { appReducer } from '../modules/app/stores/appSlice';
import { connectionReducer } from '../modules/app/stores/connectionSlice';
import { authReducer } from '../modules/auth/stores/authSlice';
import { cryptoReducer } from '../modules/crypto/stores/cryptoSlice';
import { messagingReducer } from '../modules/home/stores/messagingSlice';
import { senderPlaintextPersistListener } from './senderPlaintextPersistListener';

export const store = configureStore({
  reducer: {
    app: appReducer,
    connection: connectionReducer,
    auth: authReducer,
    crypto: cryptoReducer,
    messaging: messagingReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(senderPlaintextPersistListener.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
