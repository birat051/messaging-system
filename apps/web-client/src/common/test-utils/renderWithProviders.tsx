import { render, type RenderOptions } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { type ReactElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { appReducer } from '../../modules/app/stores/appSlice';
import { connectionReducer } from '../../modules/app/stores/connectionSlice';
import { presenceReducer } from '../../modules/app/stores/presenceSlice';
import { authReducer } from '../../modules/auth/stores/authSlice';
import { cryptoReducer } from '../../modules/crypto/stores/cryptoSlice';
import {
  notificationsInitialState,
  notificationsReducer,
} from '../../modules/app/stores/notificationsSlice';
import {
  callInitialState,
  callReducer,
} from '../../modules/home/stores/callSlice';
import {
  messagingInitialState,
  messagingReducer,
} from '../../modules/home/stores/messagingSlice';
import type { AuthState } from '../../modules/auth/stores/authSlice';
import type { RootState } from '../../store/store';
import { senderPlaintextPersistListener } from '../../store/senderPlaintextPersistListener';
import { ToastProvider } from '../components/toast/ToastProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

const defaultRootState: RootState = {
  app: { bootstrapped: true },
  connection: { presenceStatus: { kind: 'idle' } },
  presence: { byUserId: {} },
  auth: { user: null, accessToken: null, accessTokenExpiresAt: null },
  crypto: {
    keyRegistered: false,
    keyVersion: null,
    registeredPublicKeySpki: null,
    lastUpdatedAt: null,
    status: 'idle',
    error: null,
  },
  messaging: messagingInitialState,
  call: callInitialState,
  notifications: notificationsInitialState,
};

/** **`Partial<RootState>`** does not deeply partial **`auth`**; tests may omit **`accessTokenExpiresAt`**. */
export type PreloadedRootState = Omit<Partial<RootState>, 'auth'> & {
  auth?: Partial<AuthState>;
};

function mergeRootState(partial?: PreloadedRootState): RootState {
  if (!partial) {
    return defaultRootState;
  }
  return {
    app: { ...defaultRootState.app, ...partial.app },
    connection: {
      ...defaultRootState.connection,
      ...partial.connection,
    },
    presence: {
      ...defaultRootState.presence,
      ...partial.presence,
    },
    auth: { ...defaultRootState.auth, ...partial.auth },
    crypto: { ...defaultRootState.crypto, ...partial.crypto },
    messaging: {
      ...defaultRootState.messaging,
      ...partial.messaging,
    },
    call: {
      ...defaultRootState.call,
      ...partial.call,
    },
    notifications: {
      ...defaultRootState.notifications,
      ...partial.notifications,
    },
  };
}

export function createTestStore(preloadedState?: PreloadedRootState) {
  return configureStore({
    reducer: {
      app: appReducer,
      connection: connectionReducer,
      presence: presenceReducer,
      auth: authReducer,
      crypto: cryptoReducer,
      messaging: messagingReducer,
      call: callReducer,
      notifications: notificationsReducer,
    },
    preloadedState: mergeRootState(preloadedState),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(senderPlaintextPersistListener.middleware),
  });
}

export type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  /** Initial history entry (e.g. **`/settings`**) — wrap **`ui`** in **`Routes`** when using route params. */
  route?: string;
  /** Merged into the default **`RootState`**. */
  preloadedState?: PreloadedRootState;
};

/**
 * **`BrowserRouter`**-equivalent **`MemoryRouter`** + Redux **`Provider`** + **`ThemeProvider`** + **`SWRConfig`**
 * (deduping off) — per **`docs/PROJECT_PLAN.md` §14.4.1** + **`TASK_CHECKLIST.md`** integration harness.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    preloadedState,
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  const store = createTestStore(preloadedState);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>
          <ThemeProvider>
            <ToastProvider>
              <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                {children}
              </SWRConfig>
            </ToastProvider>
          </ThemeProvider>
        </MemoryRouter>
      </Provider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), store };
}
