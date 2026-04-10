import { render, type RenderOptions } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { type ReactElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { appReducer } from '../../modules/app/stores/appSlice';
import { authReducer } from '../../modules/auth/stores/authSlice';
import type { RootState } from '../../store/store';
import { ToastProvider } from '../components/toast/ToastProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

const defaultRootState: RootState = {
  app: { bootstrapped: true },
  auth: { user: null, accessToken: null },
};

function mergeRootState(partial?: Partial<RootState>): RootState {
  if (!partial) {
    return defaultRootState;
  }
  return {
    app: { ...defaultRootState.app, ...partial.app },
    auth: {
      user:
        partial.auth?.user !== undefined
          ? partial.auth.user
          : defaultRootState.auth.user,
      accessToken:
        partial.auth?.accessToken !== undefined
          ? partial.auth.accessToken
          : defaultRootState.auth.accessToken,
    },
  };
}

export function createTestStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: { app: appReducer, auth: authReducer },
    preloadedState: mergeRootState(preloadedState),
  });
}

export type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  /** Initial history entry (e.g. **`/settings`**) — wrap **`ui`** in **`Routes`** when using route params. */
  route?: string;
  /** Merged into the default **`RootState`**. */
  preloadedState?: Partial<RootState>;
};

/**
 * **`BrowserRouter`**-equivalent **`MemoryRouter`** + Redux **`Provider`** + **`ThemeProvider`** + **`SWRConfig`**
 * (deduping off) — per **`PROJECT_GUIDELINES.md`** §4.1 + **`TASK_CHECKLIST.md`** integration harness.
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
