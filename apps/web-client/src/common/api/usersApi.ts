import type { components } from '../../generated/api-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

type S = components['schemas'];

export async function getCurrentUser(): Promise<S['User']> {
  const res = await httpClient.get<S['User']>(API_PATHS.users.me);
  return res.data;
}

export async function updateCurrentUserProfile(formData: FormData): Promise<S['User']> {
  const res = await httpClient.patch<S['User']>(API_PATHS.users.me, formData, {
    // Default instance sets `application/json`; omit so the client sets multipart boundary.
    headers: { 'Content-Type': false },
  });
  return res.data;
}

export async function getUserById(userId: string): Promise<S['UserPublic']> {
  const res = await httpClient.get<S['UserPublic']>(API_PATHS.users.byId(userId));
  return res.data;
}

/**
 * `GET /users/search` — **substring** match on stored **email** and **username** (case-insensitive; see OpenAPI).
 * Sends preferred **`q`** query param; pass **`query`** trimmed and lowercased; length **3–254**; charset **`[a-z0-9@._+_-]`**.
 */
export async function searchUsers(params: {
  query: string;
  limit?: components['parameters']['LimitQuery'];
}): Promise<S['UserSearchResult'][]> {
  const res = await httpClient.get<S['UserSearchResult'][]>(API_PATHS.users.search, {
    params: { q: params.query, limit: params.limit },
  });
  return res.data;
}

/**
 * @deprecated Use **`searchUsers`** with **`query`** (preferred **`q`** on the wire). Same behaviour as legacy **`email`** param.
 */
export async function searchUsersByEmail(params: {
  email: string;
  limit?: components['parameters']['LimitQuery'];
}): Promise<S['UserSearchResult'][]> {
  return searchUsers({ query: params.email, limit: params.limit });
}

/**
 * `POST /users/me/devices` — register or update one device row (server assigns **`deviceId`** when omitted).
 * Body may use **`publicKey`** or **`pubKey`** (SPKI); optional **`deviceLabel`**; **`bootstrap: true`** → **201** and
 * **`RegisterDeviceBootstrapResponse`** (`deviceId` only).
 */
export async function registerMyDevice(
  body: S['RegisterDeviceRequest'],
): Promise<S['RegisterDeviceResponse']> {
  const res = await httpClient.post<S['RegisterDeviceResponse']>(
    API_PATHS.users.meDevices,
    body,
  );
  return res.data;
}

/** `GET /users/me/devices` — caller’s device rows including **`publicKey`** (SPKI) per row. */
export async function listMyDevices(): Promise<S['DeviceListResponse']> {
  const res = await httpClient.get<S['DeviceListResponse']>(API_PATHS.users.meDevices);
  return res.data;
}

/**
 * `DELETE /users/me/devices/{deviceId}` — remove this device from the server registry (**204**).
 * Does not rewrite historical **`Message.encryptedMessageKeys`** (see OpenAPI **`deleteMyDevice`**).
 */
export async function deleteMyDevice(deviceId: string): Promise<void> {
  await httpClient.delete(API_PATHS.users.meDeviceById(deviceId));
}

/**
 * `GET /users/me/sync/message-keys` — paginated **`encryptedMessageKeys[deviceId]`** for hybrid messages (**`deviceId`** query required).
 */
export async function listMySyncMessageKeys(params: {
  deviceId: string;
  afterMessageId?: string;
  limit?: components['parameters']['LimitQuery'];
}): Promise<S['SyncMessageKeysListResponse']> {
  const res = await httpClient.get<S['SyncMessageKeysListResponse']>(
    API_PATHS.users.meSyncMessageKeys,
    {
      params: {
        deviceId: params.deviceId,
        afterMessageId: params.afterMessageId,
        limit: params.limit,
      },
    },
  );
  return res.data;
}

/** `POST /users/me/sync/message-keys` — batch upsert wrapped keys for **`targetDeviceId`** (requires JWT **`sourceDeviceId`** claim). */
export async function postBatchSyncMessageKeys(
  body: S['BatchKeyUploadRequest'],
): Promise<S['BatchKeyUploadResponse']> {
  const res = await httpClient.post<S['BatchKeyUploadResponse']>(
    API_PATHS.users.meSyncMessageKeys,
    body,
  );
  return res.data;
}

/**
 * `GET /users/{userId}/devices/public-keys` — list devices for **`userId`** (use **`'me'`** for the signed-in user).
 */
export async function listUserDevicePublicKeys(
  userId: string,
): Promise<S['DevicePublicKeyListResponse']> {
  const res = await httpClient.get<S['DevicePublicKeyListResponse']>(
    API_PATHS.users.devicePublicKeysByUserId(userId),
  );
  return res.data;
}
