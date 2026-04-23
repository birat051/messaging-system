import { refreshTokens } from '@/common/api/authApi';
import type { AppDispatch } from '@/store/store';
import { store } from '@/store/store';
import { applyAuthResponse } from './applyAuthResponse';
import { readRefreshToken } from './authStorage';

/**
 * Requests a replacement access JWT that includes **`sourceDeviceId`** (**`POST /auth/refresh`** body).
 * Best-effort — device-bound routes keep working after the next **401** refresh if this fails.
 */
export async function upgradeAccessTokenWithDeviceBinding(
  dispatch: AppDispatch,
  deviceId: string,
): Promise<void> {
  const trimmed = deviceId.trim();
  if (trimmed.length === 0) return;
  const rt = readRefreshToken();
  if (!rt?.trim()) return;
  try {
    const data = await refreshTokens({
      refreshToken: rt,
      sourceDeviceId: trimmed,
    });
    const user = store.getState().auth.user;
    applyAuthResponse(dispatch, data, user, 'crypto.upgradeAccessTokenWithDeviceBinding');
  } catch {
    /* non-fatal */
  }
}
