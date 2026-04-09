import type { components } from '../generated/api-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

type S = components['schemas'];

export async function registerUser(
  body: S['RegisterRequest'],
): Promise<S['AuthResponse']> {
  const res = await httpClient.post<S['AuthResponse']>(API_PATHS.auth.register, body);
  return res.data;
}

export async function verifyEmail(
  body: S['VerifyEmailRequest'],
): Promise<S['VerifyEmailResponse']> {
  const res = await httpClient.post<S['VerifyEmailResponse']>(
    API_PATHS.auth.verifyEmail,
    body,
  );
  return res.data;
}

export async function resendVerificationEmail(
  body: S['ResendVerificationRequest'],
): Promise<S['ResendVerificationResponse']> {
  const res = await httpClient.post<S['ResendVerificationResponse']>(
    API_PATHS.auth.resendVerification,
    body,
  );
  return res.data;
}

export async function login(body: S['LoginRequest']): Promise<S['AuthResponse']> {
  const res = await httpClient.post<S['AuthResponse']>(API_PATHS.auth.login, body);
  return res.data;
}

/** Refresh tokens; uses **`skipAuthRefresh`** so the interceptor does not loop. */
export async function refreshTokens(
  body: S['RefreshRequest'],
): Promise<S['AuthResponse']> {
  const res = await httpClient.post<S['AuthResponse']>(API_PATHS.auth.refresh, body, {
    skipAuthRefresh: true,
  });
  return res.data;
}

export async function logout(body: S['LogoutRequest']): Promise<void> {
  await httpClient.post(API_PATHS.auth.logout, body);
}

export async function forgotPassword(
  body: S['ForgotPasswordRequest'],
): Promise<S['OkResponse']> {
  const res = await httpClient.post<S['OkResponse']>(
    API_PATHS.auth.forgotPassword,
    body,
  );
  return res.data;
}

export async function resetPassword(body: S['ResetPasswordRequest']): Promise<void> {
  await httpClient.post(API_PATHS.auth.resetPassword, body);
}
