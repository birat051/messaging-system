import type { Env } from '../../config/env.js';
import type { UserDocument } from '../../data/users/users.collection.js';
import { signAccessToken } from './accessToken.js';
import { createRefreshToken } from './refreshTokenRedis.js';

export type IssueAuthTokensOptions = {
  /** Use guest TTLs (**`GUEST_ACCESS_TOKEN_TTL_SECONDS`**, **`GUEST_REFRESH_TOKEN_TTL_SECONDS`**). */
  guest?: boolean;
  /** Optional device-bound claim for hybrid sync (**`POST /users/me/sync/message-keys`**). */
  sourceDeviceId?: string;
};

export type IssueAuthTokensResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  /** ISO 8601 — set for guest sessions (**`POST /auth/guest`**) for UI countdown. */
  expiresAt?: string;
};

/**
 * Issues access + refresh tokens. **`guest: true`** uses short-lived guest env TTLs (default **30 min** each)
 * and includes **`expiresAt`** (absolute access expiry).
 */
export async function issueAuthTokens(
  env: Env,
  user: UserDocument,
  options?: IssueAuthTokensOptions,
): Promise<IssueAuthTokensResult> {
  const version = user.refreshTokenVersion ?? 0;
  const guest = options?.guest === true;
  const signOpts =
    guest || options?.sourceDeviceId !== undefined
      ? {
          ...(guest
            ? {
                expiresInSeconds: env.GUEST_ACCESS_TOKEN_TTL_SECONDS,
                guest: true as const,
              }
            : {}),
          ...(options?.sourceDeviceId !== undefined
            ? { sourceDeviceId: options.sourceDeviceId }
            : {}),
        }
      : undefined;
  const { accessToken, expiresIn } = await signAccessToken(
    env,
    user.id,
    user.emailVerified,
    signOpts,
  );
  const refreshToken = await createRefreshToken(
    env,
    user.id,
    version,
    guest ? { ttlSeconds: env.GUEST_REFRESH_TOKEN_TTL_SECONDS } : undefined,
  );
  const expiresAt = guest
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : undefined;
  return {
    accessToken,
    refreshToken,
    expiresIn,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
}
