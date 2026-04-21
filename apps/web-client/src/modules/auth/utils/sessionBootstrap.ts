import { loadSenderPlaintextIntoRedux } from '../../../common/senderPlaintext/loadSenderPlaintextIntoRedux';
import { refreshTokens } from '../../../common/api/authApi';
import { getCurrentUser } from '../../../common/api/usersApi';
import { getStoredDeviceId } from '../../../common/crypto/privateKeyStorage';
import { isSecureContext } from '../../../common/crypto/secureContext';
import type { AppDispatch } from '../../../store/store';
import { hydrateMessagingDeviceId } from '../../crypto/stores/cryptoSlice';
import { applyAuthResponse } from './applyAuthResponse';
import { logout, setUser } from '../stores/authSlice';
import { clearRefreshToken, readRefreshToken } from './authStorage';
import {
  shouldPreferGuestReauth,
  syncGuestReauthPreferenceFromUser,
} from './guestSessionPreference';
import { navigateToGuestEntry, navigateToLogin } from '../../../routes/navigation';

let inFlight: Promise<void> | null = null;

/**
 * If **`localStorage`** has a refresh token, **`POST /auth/refresh`** then **`GET /users/me`** to
 * hydrate Redux. Safe to call multiple times (single-flight). Used on app bootstrap.
 */
export function bootstrapSessionIfNeeded(dispatch: AppDispatch): Promise<void> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    try {
      const rt = readRefreshToken();
      if (!rt) {
        return;
      }
      const data = await refreshTokens({ refreshToken: rt });
      applyAuthResponse(dispatch, data, null);
      try {
        const user = await getCurrentUser();
        dispatch(setUser(user));
        syncGuestReauthPreferenceFromUser(user);
        if (isSecureContext()) {
          const uid = user.id?.trim() ?? '';
          if (uid.length > 0) {
            try {
              const did = await getStoredDeviceId(uid);
              if (did) {
                dispatch(hydrateMessagingDeviceId(did));
              }
            } catch {
              /* IndexedDB unavailable — `ensureUserKeypairReadyForMessaging` retries */
            }
          }
        }
        await loadSenderPlaintextIntoRedux(dispatch, user.id);
      } catch {
        clearRefreshToken();
        dispatch(logout());
        if (shouldPreferGuestReauth()) {
          navigateToGuestEntry();
        } else {
          navigateToLogin();
        }
      }
    } catch {
      clearRefreshToken();
      dispatch(logout());
      if (shouldPreferGuestReauth()) {
        navigateToGuestEntry();
      } else {
        navigateToLogin();
      }
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
