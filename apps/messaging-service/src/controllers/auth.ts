import type { RequestHandler } from 'express';
import { issueAuthTokens } from '../utils/auth/issueTokens.js';
import {
  signEmailVerificationToken,
  verifyEmailVerificationToken,
} from '../utils/auth/emailVerificationJwt.js';
import {
  signPasswordResetToken,
  verifyPasswordResetToken,
} from '../utils/auth/passwordResetJwt.js';
import { getRefreshPayload, revokeRefreshToken } from '../utils/auth/refreshTokenRedis.js';
import { getClientIp } from '../utils/auth/getClientIp.js';
import {
  getClientFingerprintHeader,
  isGuestAuthRateLimited,
} from '../utils/auth/guestAuthRateLimit.js';
import {
  emailRateLimitKey,
  rateLimitExceeded,
} from '../utils/auth/rateLimitRedis.js';
import { AppError } from '../utils/errors/AppError.js';
import { logger } from '../utils/logger.js';
import { verifyPassword } from '../data/users/password.js';
import {
  createGuestUser,
  createUser,
  DuplicateEmailError,
  DuplicateUsernameError,
  findUserByEmail,
  findUserById,
  setUserEmailVerified,
  setUserPasswordAndBumpVersion,
} from '../data/users/repo.js';
import { resolveSourceDeviceIdForAccessToken } from '../data/userPublicKeys/index.js';
import { toUserApiShape } from '../data/users/publicUser.js';
import type {
  GuestRequest,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
} from '../validation/schemas.js';
import { sendPasswordResetEmail } from '../utils/email/sendPasswordResetEmail.js';
import { sendVerificationEmail } from '../utils/email/sendVerificationEmail.js';
import { computeGuestDataExpiresAt } from '../config/guestDataTtl.js';
import { getEffectiveRuntimeConfig } from '../config/runtimeConfig.js';
import type { Env } from '../config/env.js';

function requireJwtForAuth(env: Env): void {
  if (!env.JWT_SECRET?.trim()) {
    throw new AppError(
      'AUTH_NOT_CONFIGURED',
      503,
      'JWT_SECRET is not configured',
    );
  }
}

/** When verification is off, verify/resend are not part of the happy path — reject with a clear error. */
async function requireEmailVerificationEnabled(env: Env): Promise<void> {
  if (!(await getEffectiveRuntimeConfig(env)).emailVerificationRequired) {
    throw new AppError(
      'EMAIL_VERIFICATION_DISABLED',
      400,
      'Email verification is not enabled. Accounts are verified on registration.',
    );
  }
}

/**
 * **`POST /auth/guest`** — reject when **`guestSessionsEnabled`** is false (**MongoDB** **`system_config`**
 * or env **`GUEST_SESSIONS_ENABLED`** via **`getEffectiveRuntimeConfig`**). Runs **before** body validation
 * so clients get **403** even with a malformed body.
 */
export function requireGuestSessionsEnabled(env: Env): RequestHandler {
  return async (_req, _res, next) => {
    try {
      const cfg = await getEffectiveRuntimeConfig(env);
      if (!cfg.guestSessionsEnabled) {
        next(
          new AppError(
            'GUEST_SESSIONS_DISABLED',
            403,
            'Guest sessions are disabled.',
          ),
        );
        return;
      }
      next();
    } catch (err: unknown) {
      next(err);
    }
  };
}

export function postRegister(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      const ip = getClientIp(req);
      const regKey = `ratelimit:register:ip:${ip}`;
      if (
        await rateLimitExceeded(
          regKey,
          env.REGISTER_RATE_LIMIT_WINDOW_SEC,
          env.REGISTER_RATE_LIMIT_MAX,
        )
      ) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many registration attempts; try again later',
          ),
        );
        return;
      }

      const body = req.body as RegisterRequest;
      const runtimeCfg = await getEffectiveRuntimeConfig(env);
      const emailVerified = !runtimeCfg.emailVerificationRequired;
      const user = await createUser({
        email: body.email,
        password: body.password,
        username: body.username,
        displayName: body.displayName.trim(),
        profilePicture: body.profilePicture ?? undefined,
        status: body.status ?? undefined,
        emailVerified,
      });

      if (runtimeCfg.emailVerificationRequired) {
        const regEmail = user.email;
        if (!regEmail) {
          next(
            new AppError(
              'INTERNAL_ERROR',
              500,
              'Registered user missing email after signup',
            ),
          );
          return;
        }
        const verificationToken = await signEmailVerificationToken(
          env,
          user.id,
          regEmail,
        );
        if (env.NODE_ENV !== 'production') {
          logger.info(
            { userId: user.id, email: regEmail },
            'email verification token (dev — configure mail in production)',
          );
          logger.debug({ verificationToken }, 'verification JWT');
        } else {
          logger.info(
            { userId: user.id },
            'user registered; sending verification email when SendGrid is configured',
          );
        }
        try {
          await sendVerificationEmail(env, {
            to: regEmail,
            verificationToken,
          });
        } catch (err: unknown) {
          logger.error(
            { err, userId: user.id },
            'failed to send verification email',
          );
        }
      } else {
        logger.info(
          { userId: user.id, email: user.email ?? null },
          'user registered; email verification skipped (verification not required)',
        );
      }

      if (!user.emailVerified) {
        res.status(201).json({
          accessToken: null,
          refreshToken: null,
          tokenType: 'Bearer',
          expiresIn: null,
        });
        return;
      }

      const sourceDeviceId = await resolveSourceDeviceIdForAccessToken(
        user.id,
        body.sourceDeviceId,
      );
      const tokens = await issueAuthTokens(
        env,
        user,
        sourceDeviceId !== undefined ? { sourceDeviceId } : undefined,
      );
      res.status(201).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokens.expiresIn,
      });
    } catch (err: unknown) {
      if (err instanceof DuplicateEmailError) {
        next(
          new AppError(
            'EMAIL_ALREADY_REGISTERED',
            409,
            'An account with this email already exists',
          ),
        );
        return;
      }
      if (err instanceof DuplicateUsernameError) {
        next(
          new AppError(
            'USERNAME_TAKEN',
            409,
            'This username is already taken',
          ),
        );
        return;
      }
      next(err);
    }
  };
}

export function postLogin(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      const body = req.body as LoginRequest;
      const user = await findUserByEmail(body.email);
      if (
        !user ||
        !(await verifyPassword(user.passwordHash, body.password))
      ) {
        next(
          new AppError(
            'INVALID_CREDENTIALS',
            401,
            'Invalid email or password',
          ),
        );
        return;
      }
      if (!user.emailVerified) {
        next(
          new AppError(
            'EMAIL_NOT_VERIFIED',
            403,
            'Verify your email before signing in',
          ),
        );
        return;
      }
      const sourceDeviceId = await resolveSourceDeviceIdForAccessToken(
        user.id,
        body.sourceDeviceId,
      );
      const tokens = await issueAuthTokens(
        env,
        user,
        sourceDeviceId !== undefined ? { sourceDeviceId } : undefined,
      );
      res.status(200).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokens.expiresIn,
      });
    } catch (err: unknown) {
      next(err);
    }
  };
}

export function postRefresh(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      const body = req.body as RefreshRequest;
      const { refreshToken: rawRefresh } = body;
      const stored = await getRefreshPayload(rawRefresh);
      if (!stored) {
        next(
          new AppError(
            'INVALID_REFRESH_TOKEN',
            401,
            'Invalid or expired refresh token',
          ),
        );
        return;
      }
      const user = await findUserById(stored.userId);
      if (!user) {
        await revokeRefreshToken(rawRefresh);
        next(
          new AppError(
            'INVALID_REFRESH_TOKEN',
            401,
            'Invalid or expired refresh token',
          ),
        );
        return;
      }
      if ((user.refreshTokenVersion ?? 0) !== stored.v) {
        await revokeRefreshToken(rawRefresh);
        next(
          new AppError(
            'INVALID_REFRESH_TOKEN',
            401,
            'Refresh token has been revoked',
          ),
        );
        return;
      }
      const refreshRuntimeCfg = await getEffectiveRuntimeConfig(env);
      if (
        refreshRuntimeCfg.emailVerificationRequired &&
        !user.emailVerified
      ) {
        next(
          new AppError(
            'EMAIL_NOT_VERIFIED',
            403,
            'Verify your email before refreshing',
          ),
        );
        return;
      }
      const sourceDeviceId = await resolveSourceDeviceIdForAccessToken(
        user.id,
        body.sourceDeviceId,
      );
      const tokens = await issueAuthTokens(env, user, {
        guest: user.isGuest === true,
        ...(sourceDeviceId !== undefined ? { sourceDeviceId } : {}),
      });
      await revokeRefreshToken(rawRefresh);
      res.status(200).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokens.expiresIn,
        ...(tokens.expiresAt !== undefined ? { expiresAt: tokens.expiresAt } : {}),
      });
    } catch (err: unknown) {
      next(err);
    }
  };
}

export function postLogout(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      const { refreshToken: rawRefresh } = req.body as { refreshToken: string };
      await revokeRefreshToken(rawRefresh);
      res.status(204).send();
    } catch (err: unknown) {
      next(err);
    }
  };
}

export function postForgotPassword(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      const ip = getClientIp(req);
      const key = `ratelimit:forgot-password:ip:${ip}`;
      if (
        await rateLimitExceeded(
          key,
          env.FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SEC,
          env.FORGOT_PASSWORD_RATE_LIMIT_MAX,
        )
      ) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many password reset requests; try again later',
          ),
        );
        return;
      }
      const { email } = req.body as { email: string };
      const user = await findUserByEmail(email);
      if (user?.email) {
        const token = await signPasswordResetToken(env, user.id, user.email);
        if (env.NODE_ENV !== 'production') {
          logger.debug(
            { userId: user.id },
            'password reset token (dev — do not log in production)',
          );
          logger.debug({ token }, 'password reset JWT');
        }
        try {
          await sendPasswordResetEmail(env, { to: user.email, token });
        } catch (err: unknown) {
          logger.error(
            { err, userId: user.id },
            'failed to send password reset email',
          );
        }
      }
      res.status(200).json({ ok: true });
    } catch (err: unknown) {
      next(err);
    }
  };
}

export function postResetPassword(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      const body = req.body as { token: string; password: string };
      const claims = await verifyPasswordResetToken(env, body.token);
      const user = await findUserById(claims.userId);
      if (!user || user.email !== claims.email) {
        next(
          new AppError(
            'INVALID_PASSWORD_RESET_TOKEN',
            400,
            'Password reset token is not valid for this account',
          ),
        );
        return;
      }
      if (user.isGuest === true) {
        next(
          new AppError(
            'GUEST_ACTION_FORBIDDEN',
            403,
            'Password reset does not apply to guest accounts',
          ),
        );
        return;
      }
      const ok = await setUserPasswordAndBumpVersion(user.id, body.password);
      if (!ok) {
        next(new AppError('INTERNAL_ERROR', 500, 'Could not update password'));
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      next(err);
    }
  };
}

export function postVerifyEmail(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      await requireEmailVerificationEnabled(env);
      const ip = getClientIp(req);
      const key = `ratelimit:verify-email:ip:${ip}`;
      if (
        await rateLimitExceeded(
          key,
          env.VERIFY_EMAIL_RATE_LIMIT_WINDOW_SEC,
          env.VERIFY_EMAIL_RATE_LIMIT_MAX,
        )
      ) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many attempts; try again later',
          ),
        );
        return;
      }

      const { token } = req.body as { token: string };
      const claims = await verifyEmailVerificationToken(env, token);

      const user = await findUserById(claims.userId);
      if (!user) {
        next(
          new AppError(
            'INVALID_VERIFICATION_TOKEN',
            400,
            'User not found for this token',
          ),
        );
        return;
      }
      if (user.isGuest === true) {
        next(
          new AppError(
            'GUEST_ACTION_FORBIDDEN',
            403,
            'Email verification does not apply to guest accounts',
          ),
        );
        return;
      }
      if (user.email !== claims.email) {
        next(
          new AppError(
            'INVALID_VERIFICATION_TOKEN',
            400,
            'Token does not match user email',
          ),
        );
        return;
      }
      if (user.emailVerified) {
        const tokens = await issueAuthTokens(env, user);
        res.status(200).json({
          user: toUserApiShape(user),
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: 'Bearer',
          expiresIn: tokens.expiresIn,
        });
        return;
      }

      await setUserEmailVerified(user.id, true);
      const updated = await findUserById(user.id);
      if (!updated) {
        next(
          new AppError('INTERNAL_ERROR', 500, 'User missing after verify'),
        );
        return;
      }
      const tokens = await issueAuthTokens(env, updated);
      res.status(200).json({
        user: toUserApiShape(updated),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokens.expiresIn,
      });
    } catch (err: unknown) {
      next(err);
    }
  };
}

export function postResendVerification(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      await requireEmailVerificationEnabled(env);
      const body = req.body as { email: string };
      const emailKey = emailRateLimitKey(body.email);
      if (
        await rateLimitExceeded(
          emailKey,
          env.RESEND_RATE_LIMIT_WINDOW_SEC,
          env.RESEND_RATE_LIMIT_MAX,
        )
      ) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many resend requests for this email; try again later',
          ),
        );
        return;
      }

      const user = await findUserByEmail(body.email);
      if (!user || user.emailVerified) {
        res.status(200).json({ ok: true });
        return;
      }
      if (!user.email) {
        res.status(200).json({ ok: true });
        return;
      }

      const verificationToken = await signEmailVerificationToken(
        env,
        user.id,
        user.email,
      );
      if (env.NODE_ENV !== 'production') {
        logger.debug(
          { userId: user.id, verificationToken },
          'resend verification JWT (dev)',
        );
      } else {
        logger.info(
          { userId: user.id },
          'resend verification email when SendGrid is configured',
        );
      }

      try {
        await sendVerificationEmail(env, {
          to: user.email,
          verificationToken,
        });
      } catch (err: unknown) {
        logger.error(
          { err, userId: user.id },
          'failed to send verification resend email',
        );
        next(
          new AppError(
            'EMAIL_SEND_FAILED',
            503,
            'Could not send verification email; try again later',
          ),
        );
        return;
      }

      res.status(200).json({ ok: true });
    } catch (err: unknown) {
      next(err);
    }
  };
}

/**
 * **`POST /auth/guest`** — creates a **guest** row in **`users`** (no **`email`**; optional MongoDB TTL via
 * **`guestDataExpiresAt`**) and returns **`GuestAuthResponse`**.
 */
export function postGuest(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      requireJwtForAuth(env);
      const ip = getClientIp(req);
      const fingerprint = getClientFingerprintHeader(req);
      if (
        await isGuestAuthRateLimited(env, {
          ip,
          ...(fingerprint !== undefined ? { fingerprintRaw: fingerprint } : {}),
        })
      ) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many guest session attempts; try again later',
          ),
        );
        return;
      }
      const body = req.body as GuestRequest;
      const runtimeCfg = await getEffectiveRuntimeConfig(env);
      const guestDataExpiresAt = computeGuestDataExpiresAt(env, runtimeCfg);
      let user;
      try {
        user = await createGuestUser(body, { guestDataExpiresAt });
      } catch (err: unknown) {
        if (err instanceof DuplicateUsernameError) {
          next(
            new AppError(
              'USERNAME_TAKEN',
              409,
              'This username is already taken',
            ),
          );
          return;
        }
        throw err;
      }
      const sourceDeviceId = await resolveSourceDeviceIdForAccessToken(
        user.id,
        body.sourceDeviceId,
      );
      const tokens = await issueAuthTokens(env, user, {
        guest: true,
        ...(sourceDeviceId !== undefined ? { sourceDeviceId } : {}),
      });
      res.status(200).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokens.expiresIn,
        ...(tokens.expiresAt !== undefined ? { expiresAt: tokens.expiresAt } : {}),
        user: toUserApiShape(user),
      });
    } catch (err: unknown) {
      next(err);
    }
  };
}
