import { useCallback } from 'react';
import type { components } from '../../generated/api-types';
import {
  clearCryptoError,
  registerDevice as registerDeviceThunk,
} from '../../modules/crypto/stores/cryptoSlice';
import {
  selectMessagingDeviceId,
  selectPublicKeyRegistered,
  selectPublicKeyUploadError,
  selectPublicKeyUploadStatus,
  selectPublicKeyVersion,
} from '../../modules/crypto/stores/selectors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';

type RegisterDeviceRequest = components['schemas']['RegisterDeviceRequest'];

/**
 * Register or update this browser’s **device** public key (**`POST /v1/users/me/devices`**). Uses Redux
 * **`registerDevice`** thunk (**`cryptoSlice`**); transient HTTP errors (**429**, **5xx**, network) are retried with
 * backoff inside the thunk. Session bootstrap calls the same thunk from **`ensureUserKeypairReadyForMessaging`**
 * (no **`PUT /users/me/public-key`** / **`rotate`** — those legacy routes are not used by this client).
 */
export function useRegisterDevice() {
  const dispatch = useAppDispatch();
  const keyRegistered = useAppSelector(selectPublicKeyRegistered);
  const keyVersion = useAppSelector(selectPublicKeyVersion);
  const deviceId = useAppSelector(selectMessagingDeviceId);
  const status = useAppSelector(selectPublicKeyUploadStatus);
  const error = useAppSelector(selectPublicKeyUploadError);

  const registerDevice = useCallback(
    (body: RegisterDeviceRequest) => dispatch(registerDeviceThunk(body)),
    [dispatch],
  );

  const dismissError = useCallback(() => {
    dispatch(clearCryptoError());
  }, [dispatch]);

  return {
    keyRegistered,
    keyVersion,
    deviceId,
    status,
    error,
    registerDevice,
    dismissError,
  };
}

/** @deprecated Use **`useRegisterDevice`** — same hook (per-device **`POST /users/me/devices`**). */
export const useRegisterPublicKey = useRegisterDevice;
