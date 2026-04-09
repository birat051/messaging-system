import type { components } from '../../generated/api-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

type S = components['schemas'];

export async function createGroup(body: S['CreateGroupRequest']): Promise<S['Group']> {
  const res = await httpClient.post<S['Group']>(API_PATHS.groups.create, body);
  return res.data;
}
