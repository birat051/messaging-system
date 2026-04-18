import { Router } from 'express';
import type { Env } from '../config/env.js';
import {
  postForgotPassword,
  postGuest,
  postLogin,
  postLogout,
  postRefresh,
  postRegister,
  postResendVerification,
  postResetPassword,
  postVerifyEmail,
  requireGuestSessionsEnabled,
} from '../controllers/auth.js';
import { validateBody } from '../validation/middleware.js';
import {
  forgotPasswordRequestSchema,
  guestRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from '../validation/schemas.js';

/**
 * Auth HTTP routes — **wiring only**. Handlers live in **`src/controllers/auth.ts`**.
 *
 * Per-route Redis caps (**`REGISTER_RATE_LIMIT_*`**, **`FORGOT_PASSWORD_RATE_LIMIT_*`**, …)
 * **stack** with **`GLOBAL_RATE_LIMIT_*`** (middleware runs first on **`/v1`** — separate keys).
 */
export function createAuthRouter(env: Env): Router {
  const router = Router();

  router.post(
    '/auth/register',
    validateBody(registerRequestSchema),
    postRegister(env),
  );

  router.post('/auth/login', validateBody(loginRequestSchema), postLogin(env));

  router.post(
    '/auth/refresh',
    validateBody(refreshRequestSchema),
    postRefresh(env),
  );

  router.post('/auth/logout', validateBody(logoutRequestSchema), postLogout(env));

  router.post(
    '/auth/forgot-password',
    validateBody(forgotPasswordRequestSchema),
    postForgotPassword(env),
  );

  router.post(
    '/auth/reset-password',
    validateBody(resetPasswordRequestSchema),
    postResetPassword(env),
  );

  router.post(
    '/auth/verify-email',
    validateBody(verifyEmailRequestSchema),
    postVerifyEmail(env),
  );

  router.post(
    '/auth/resend-verification',
    validateBody(resendVerificationRequestSchema),
    postResendVerification(env),
  );

  router.post(
    '/auth/guest',
    requireGuestSessionsEnabled(env),
    validateBody(guestRequestSchema),
    postGuest(env),
  );

  return router;
}
