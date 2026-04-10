import type { components } from '../../generated/api-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

type S = components['schemas'];

/**
 * **`POST /v1/messages`** (OpenAPI **`sendMessage`**, **deprecated**).
 *
 * Production UI sends via Socket.IO **`message:send`**. This HTTP helper remains for **scripts** and any
 * tooling that still calls the REST surface; Vitest uses **`mockSendMessageForVitest`** instead (no HTTP).
 */
export async function sendMessage(body: S['SendMessageRequest']): Promise<S['Message']> {
  const res = await httpClient.post<S['Message']>(API_PATHS.messages.send, body);
  return res.data;
}
