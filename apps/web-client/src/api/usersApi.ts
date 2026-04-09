import type { components } from '../generated/api-types';
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

export async function searchUsersByEmail(params: {
  email: string;
  limit?: components['parameters']['LimitQuery'];
}): Promise<S['UserSearchResult'][]> {
  const res = await httpClient.get<S['UserSearchResult'][]>(API_PATHS.users.search, {
    params: { email: params.email, limit: params.limit },
  });
  return res.data;
}
