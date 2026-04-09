import { httpClient } from './httpClient';

/**
 * **POST/PATCH/DELETE** helpers using **`httpClient`** (same transport as **`swrFetcher`**).
 * Use with **`useSWRMutation`** from **`swr/mutation`**, or call directly after form actions.
 *
 * @example
 * ```tsx
 * import useSWRMutation from 'swr/mutation';
 * import { httpPost } from './httpMutations';
 *
 * const { trigger, isMutating } = useSWRMutation(
 *   '/messages',
 *   (_url, { arg }: { arg: NewMessageBody }) => httpPost('/messages', arg),
 * );
 * ```
 */
export async function httpPost<T = unknown>(
  url: string,
  data?: unknown,
): Promise<T> {
  return httpClient.post<T>(url, data).then((r) => r.data);
}

export async function httpPatch<T = unknown>(
  url: string,
  data?: unknown,
): Promise<T> {
  return httpClient.patch<T>(url, data).then((r) => r.data);
}

export async function httpPut<T = unknown>(
  url: string,
  data?: unknown,
): Promise<T> {
  return httpClient.put<T>(url, data).then((r) => r.data);
}

export async function httpDelete<T = unknown>(url: string): Promise<T> {
  return httpClient.delete<T>(url).then((r) => r.data);
}
