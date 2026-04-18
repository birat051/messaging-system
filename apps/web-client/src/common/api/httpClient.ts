import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { Store } from '@reduxjs/toolkit';
import { getToastBridge } from '../components/toast/toastBridge';
import { getApiBaseUrl } from '../utils/apiConfig';
import { parseApiError } from '../../modules/auth/utils/apiError';
import type { components } from '../../generated/api-types';
import { logout, setSession } from '../../modules/auth/stores/authSlice';
import {
  clearRefreshToken,
  readRefreshToken,
  writeRefreshToken,
} from '../../modules/auth/utils/authStorage';
import { navigateToGuestEntry, navigateToLogin } from '../../routes/navigation';
import type { AppDispatch, RootState } from '../../store/store';
import { API_PATHS } from './paths';

type AuthResponse = components['schemas']['AuthResponse'];

/**
 * Single shared Axios instance for REST calls (**`docs/PROJECT_PLAN.md` §14** + task checklist).
 * **`baseURL`** includes **`/v1`** — use paths like **`/users/me`**, not **`/v1/users/me`**.
 * Call **`attachHttpAuth(store)`** once from **`main.tsx`** after the store exists.
 *
 * **429 (rate limits):** response interceptor rejects immediately — no **401** refresh path, no retries.
 * When **`ToastProvider`** is mounted, a **`warning`** toast shows **`parseApiError`**’s message ( **`toastBridge`** ).
 */
export const httpClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30_000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

const MAX_REFRESH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

let refreshPromise: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performRefresh(
  store: Store<RootState>,
  dispatch: AppDispatch,
): Promise<void> {
  const rt = readRefreshToken();
  if (!rt) {
    throw new Error('no refresh token');
  }

  for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt++) {
    try {
      const res = await httpClient.post('/auth/refresh', { refreshToken: rt }, {
        skipAuthRefresh: true,
      });
      const data = res.data as AuthResponse;
      const access = data.accessToken ?? null;
      if (!access) {
        throw new Error('missing access token');
      }
      const user = store.getState().auth.user;
      dispatch(
        setSession({
          user,
          accessToken: access,
          accessTokenExpiresAt: data.expiresAt ?? null,
        }),
      );
      if (data.refreshToken) {
        writeRefreshToken(data.refreshToken);
      }
      return;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const st = e.response?.status;
        if (st === 401 || st === 403 || st === 429) {
          throw e;
        }
      }
      if (attempt === MAX_REFRESH_ATTEMPTS) {
        throw e;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function refreshWithMutex(store: Store<RootState>): Promise<void> {
  const dispatch = store.dispatch as AppDispatch;
  if (refreshPromise) {
    await refreshPromise;
    return;
  }
  refreshPromise = performRefresh(store, dispatch).finally(() => {
    refreshPromise = null;
  });
  await refreshPromise;
}

function clearSessionAndLogin(store: Store<RootState>): void {
  const dispatch = store.dispatch as AppDispatch;
  const wasGuest = store.getState().auth.user?.guest === true;
  clearRefreshToken();
  dispatch(logout());
  if (wasGuest) {
    navigateToGuestEntry();
  } else {
    navigateToLogin();
  }
}

export function attachHttpAuth(store: Store<RootState>): void {
  httpClient.interceptors.request.use((config) => {
    const isRefresh =
      (config.url ?? '').includes(API_PATHS.auth.refresh) ||
      config.skipAuthRefresh === true;
    const token = store.getState().auth.accessToken;
    if (token && !isRefresh) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  httpClient.interceptors.response.use(
    (r) => r,
    async (error: AxiosError) => {
      const original = error.config as InternalAxiosRequestConfig | undefined;
      const status = error.response?.status;

      // 429 (global / route rate limits): reject immediately — never refresh or retry here.
      if (status === 429) {
        const toast = getToastBridge();
        if (toast) {
          toast.warning(parseApiError(error).message);
        }
        return Promise.reject(error);
      }

      if (!original || status !== 401) {
        return Promise.reject(error);
      }

      if (original.skipAuthRefresh) {
        return Promise.reject(error);
      }

      if ((original.url ?? '').includes(API_PATHS.auth.refresh)) {
        clearSessionAndLogin(store);
        return Promise.reject(error);
      }

      if (original._retryAfterRefresh) {
        clearSessionAndLogin(store);
        return Promise.reject(error);
      }

      if (!readRefreshToken()) {
        clearSessionAndLogin(store);
        return Promise.reject(error);
      }

      try {
        await refreshWithMutex(store);
      } catch {
        clearSessionAndLogin(store);
        return Promise.reject(error);
      }

      const token = store.getState().auth.accessToken;
      if (!token) {
        clearSessionAndLogin(store);
        return Promise.reject(error);
      }

      original._retryAfterRefresh = true;
      original.headers.set('Authorization', `Bearer ${token}`);
      return httpClient.request(original);
    },
  );
}
