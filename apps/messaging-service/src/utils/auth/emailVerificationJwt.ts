import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../../config/env.js';
import { AppError } from '../errors/AppError.js';

const ISSUER = 'messaging-service';
const PURPOSE = 'email_verification';

function secretKey(env: Env): Uint8Array {
  if (!env.JWT_SECRET?.trim()) {
    throw new AppError(
      'AUTH_NOT_CONFIGURED',
      503,
      'JWT_SECRET is not configured; cannot issue or verify email tokens',
    );
  }
  return new TextEncoder().encode(env.JWT_SECRET.trim());
}

export async function signEmailVerificationToken(
  env: Env,
  userId: string,
  email: string,
): Promise<string> {
  const key = secretKey(env);
  return new SignJWT({
    purpose: PURPOSE,
    email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS}h`)
    .sign(key);
}

export async function verifyEmailVerificationToken(
  env: Env,
  token: string,
): Promise<{ userId: string; email: string }> {
  const key = secretKey(env);
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      algorithms: ['HS256'],
    });
    if (payload.purpose !== PURPOSE) {
      throw new Error('invalid purpose');
    }
    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!userId || !email) {
      throw new Error('missing claims');
    }
    return { userId, email };
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      'INVALID_VERIFICATION_TOKEN',
      400,
      'Invalid or expired verification token',
      err,
    );
  }
}
