import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { logout } from '@/modules/auth/stores/authSlice';
import type { UserPresenceEntry } from './presenceTypes';

export type PresenceState = {
  /** Hot + durable last-seen from **`presence:getLastSeen`**; omit key ⇒ treat as **`idle`**. */
  byUserId: Record<string, UserPresenceEntry>;
};

const initialState: PresenceState = {
  byUserId: {},
};

function toTerminalEntry(
  result:
    | { status: 'ok'; source: 'redis' | 'mongodb'; lastSeenAt: string }
    | { status: 'not_available' },
): Exclude<UserPresenceEntry, { status: 'idle' | 'loading' }> {
  if (result.status === 'ok') {
    return {
      status: 'ok',
      source: result.source,
      lastSeenAt: result.lastSeenAt,
    };
  }
  return { status: 'not_available' };
}

const presenceSlice = createSlice({
  name: 'presence',
  initialState,
  reducers: {
    /** Drop cached presence for one user (e.g. socket down). */
    presenceClearedForUser(state, action: PayloadAction<{ userId: string }>) {
      delete state.byUserId[action.payload.userId];
    },
    presenceUserLoading(state, action: PayloadAction<{ userId: string }>) {
      state.byUserId[action.payload.userId] = { status: 'loading' };
    },
    presenceUserFromResult(
      state,
      action: PayloadAction<{
        userId: string;
        result:
          | { status: 'ok'; source: 'redis' | 'mongodb'; lastSeenAt: string }
          | { status: 'not_available' };
      }>,
    ) {
      state.byUserId[action.payload.userId] = toTerminalEntry(action.payload.result);
    },
    presenceUserError(
      state,
      action: PayloadAction<{ userId: string; message: string }>,
    ) {
      state.byUserId[action.payload.userId] = {
        status: 'error',
        message: action.payload.message,
      };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logout, () => initialState);
  },
});

export const {
  presenceClearedForUser,
  presenceUserLoading,
  presenceUserFromResult,
  presenceUserError,
} = presenceSlice.actions;

export const { reducer: presenceReducer } = presenceSlice;
