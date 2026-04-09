import type { components } from '../../generated/api-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

type S = components['schemas'];

export async function getHealth(): Promise<S['HealthResponse']> {
  const res = await httpClient.get<S['HealthResponse']>(API_PATHS.health);
  return res.data;
}

export async function getReady(): Promise<S['ReadyResponse']> {
  const res = await httpClient.get<S['ReadyResponse']>(API_PATHS.ready);
  return res.data;
}
