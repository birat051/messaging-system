export {
  DEFAULT_SINGLE_DEVICE_ID,
  LEGACY_USER_PUBLIC_KEYS_COLLECTION,
  USER_DEVICE_PUBLIC_KEYS_COLLECTION,
  ensureUserPublicKeyIndexes,
} from './user_public_keys.collection.js';
export type { UserPublicKeyDocument } from './user_public_keys.collection.js';
export {
  deleteDeviceForUser,
  findDevicePublicKeysByUserId,
  findUserDeviceRow,
  registerOrUpdateDevice,
  resolveSourceDeviceIdForAccessToken,
  toDevicePublicKeysListResponse,
  toMyDevicesListResponse,
  toRegisterDeviceBootstrapResponse,
  toRegisterDeviceResponse,
} from './repo.js';
export type {
  DevicePublicKeysListResponseApi,
  MyDevicesListResponseApi,
  RegisterDeviceBootstrapResponseApi,
  RegisterDeviceOutcome,
  RegisterDeviceResponseApi,
} from './repo.js';
export { resolvePublicKeyFetchAuthz } from './resolvePublicKeyFetchAuthz.js';
export type { PublicKeyFetchAuthz } from './resolvePublicKeyFetchAuthz.js';
