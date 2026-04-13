import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PresenceConnectionStatus } from '@/common/realtime/socketBridge';

export type ConnectionState = {
  /** Mirrored from **`SocketWorkerProvider`** — single writer. */
  presenceStatus: PresenceConnectionStatus;
};

const initialState: ConnectionState = {
  presenceStatus: { kind: 'idle' },
};

const connectionSlice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    setPresenceStatus(state, action: PayloadAction<PresenceConnectionStatus>) {
      state.presenceStatus = action.payload;
    },
  },
});

export const { setPresenceStatus } = connectionSlice.actions;
export const { reducer: connectionReducer } = connectionSlice;
