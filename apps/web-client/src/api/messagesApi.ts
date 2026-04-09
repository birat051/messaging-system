import type { components } from '../generated/api-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

type S = components['schemas'];

export async function sendMessage(body: S['SendMessageRequest']): Promise<S['Message']> {
  const res = await httpClient.post<S['Message']>(API_PATHS.messages.send, body);
  return res.data;
}
