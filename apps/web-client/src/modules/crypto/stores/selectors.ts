import type { RootState } from '../../../store/store';

export const selectCrypto = (state: RootState) => state.crypto;

export const selectPublicKeyRegistered = (state: RootState) =>
  state.crypto.keyRegistered;

export const selectPublicKeyVersion = (state: RootState) =>
  state.crypto.keyVersion;

export const selectPublicKeyUploadStatus = (state: RootState) =>
  state.crypto.status;

export const selectPublicKeyUploadError = (state: RootState) =>
  state.crypto.error;

export const selectPublicKeyLastUpdatedAt = (state: RootState) =>
  state.crypto.lastUpdatedAt;

export const selectRegisteredPublicKeySpki = (state: RootState) =>
  state.crypto.registeredPublicKeySpki;
