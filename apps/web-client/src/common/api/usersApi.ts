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

export async function getUserPublicKeyById(
  userId: string,
): Promise<S['UserPublicKeyResponse']> {
  const res = await httpClient.get<S['UserPublicKeyResponse']>(
    API_PATHS.users.publicKeyById(userId),
  );
  return res.data;
}

/**
 * `GET /users/search` — **substring** match on stored emails (case-insensitive; see OpenAPI).
 * Pass **`email`** trimmed and lowercased; length **2–254**; charset **`[a-z0-9@._+-]`**.
 */
export async function searchUsersByEmail(params: {
  email: string;
  limit?: components['parameters']['LimitQuery'];
}): Promise<S['UserSearchResult'][]> {
  const res = await httpClient.get<S['UserSearchResult'][]>(API_PATHS.users.search, {
    params: { email: params.email, limit: params.limit },
  });
  return res.data;
}

export async function putMyPublicKey(
  body: S['PutPublicKeyRequest'],
): Promise<S['UserPublicKeyResponse']> {
  const res = await httpClient.put<S['UserPublicKeyResponse']>(
    API_PATHS.users.mePublicKey,
    body,
  );
  return res.data;
}

export async function rotateMyPublicKey(
  body: S['RotatePublicKeyRequest'],
): Promise<S['UserPublicKeyResponse']> {
  const res = await httpClient.post<S['UserPublicKeyResponse']>(
    API_PATHS.users.mePublicKeyRotate,
    body,
  );
  return res.data;
}
