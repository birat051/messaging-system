import { useCallback } from 'react';
import type { components } from '../../generated/api-types';
import {
  clearCryptoError,
  rotatePublicKey as rotatePublicKeyThunk,
  uploadPublicKey as uploadPublicKeyThunk,
} from '../../modules/crypto/stores/cryptoSlice';
import {
  selectPublicKeyRegistered,
  selectPublicKeyUploadError,
  selectPublicKeyUploadStatus,
  selectPublicKeyVersion,
} from '../../modules/crypto/stores/selectors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';

type PutPublicKeyRequest = components['schemas']['PutPublicKeyRequest'];
type RotatePublicKeyRequest = components['schemas']['RotatePublicKeyRequest'];

/**
 * Register or update the caller’s **user-level** public key (**PUT `/users/me/public-key`**) and
 * rotate (**POST `/users/me/public-key/rotate`**). Uses Redux **`crypto`** slice; transient HTTP errors
 * (**429**, **5xx**, network) are retried with backoff inside the thunks.
 */
export function useRegisterPublicKey() {
  const dispatch = useAppDispatch();
  const keyRegistered = useAppSelector(selectPublicKeyRegistered);
  const keyVersion = useAppSelector(selectPublicKeyVersion);
  const status = useAppSelector(selectPublicKeyUploadStatus);
  const error = useAppSelector(selectPublicKeyUploadError);

  const registerOrUpdatePublicKey = useCallback(
    (body: PutPublicKeyRequest) => dispatch(uploadPublicKeyThunk(body)),
    [dispatch],
  );

  const rotateKey = useCallback(
    (body: RotatePublicKeyRequest) => dispatch(rotatePublicKeyThunk(body)),
    [dispatch],
  );

  const dismissError = useCallback(() => {
    dispatch(clearCryptoError());
  }, [dispatch]);

  return {
    keyRegistered,
    keyVersion,
    status,
    error,
    registerOrUpdatePublicKey,
    rotatePublicKey: rotateKey,
    dismissError,
  };
}
