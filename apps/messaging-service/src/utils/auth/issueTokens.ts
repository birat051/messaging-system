import type { Env } from '../../config/env.js';
import type { UserDocument } from '../../data/users/users.collection.js';
import { signAccessToken } from './accessToken.js';
import { createRefreshToken } from './refreshTokenRedis.js';

export async function issueAuthTokens(
  env: Env,
  user: UserDocument,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const version = user.refreshTokenVersion ?? 0;
  const { accessToken, expiresIn } = await signAccessToken(
    env,
    user.id,
    user.emailVerified,
  );
  const refreshToken = await createRefreshToken(env, user.id, version);
  return { accessToken, refreshToken, expiresIn };
}
