import { SignJWT, type JWTPayload } from 'jose';
import type { Env } from '../../config/env.js';
import { AppError } from '../errors/AppError.js';

const ISSUER = 'messaging-service';

function secretKey(env: Env): Uint8Array {
  if (!env.JWT_SECRET?.trim()) {
    throw new AppError(
      'AUTH_NOT_CONFIGURED',
      503,
      'JWT_SECRET is not configured',
    );
  }
  return new TextEncoder().encode(env.JWT_SECRET.trim());
}

export type SignAccessTokenOptions = {
  /** Override **`env.ACCESS_TOKEN_TTL_SECONDS`** (e.g. guest sessions). */
  expiresInSeconds?: number;
  /** When true, JWT payload includes **`guest: true`** (clients may branch without loading **`User`**). */
  guest?: boolean;
};

/**
 * Short-lived access JWT after registration (or login later). **`email_verified`** mirrors the user record.
 */
export async function signAccessToken(
  env: Env,
  userId: string,
  emailVerified: boolean,
  options?: SignAccessTokenOptions,
): Promise<{ accessToken: string; expiresIn: number }> {
  const key = secretKey(env);
  const expiresIn = options?.expiresInSeconds ?? env.ACCESS_TOKEN_TTL_SECONDS;
  const payload: JWTPayload = {
    email_verified: emailVerified,
  };
  if (options?.guest === true) {
    payload.guest = true;
  }
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(key);
  return { accessToken: token, expiresIn };
}
