import type { SWRConfiguration } from 'swr';
import { httpClient } from './httpClient';

/**
 * Default **`useSWR`** fetcher: **`GET`** via **`httpClient`** so **`baseURL`**, interceptors, and **401** refresh apply.
 * Use **`API_PATHS`** from **`./paths`** for keys (e.g. **`API_PATHS.users.me`**) or an **array** whose first element is that path.
 */
export function swrFetcher<T = unknown>(
  key: string | readonly unknown[],
): Promise<T> {
  if (typeof key === 'string') {
    return httpClient.get<T>(key).then((r) => r.data);
  }
  if (Array.isArray(key) && key.length > 0 && typeof key[0] === 'string') {
    return httpClient.get<T>(key[0]).then((r) => r.data);
  }
  throw new Error('swrFetcher: key must be a URL string or [url, ...deps]');
}

/** Pass to **`<SWRConfig value={swrConfigValue}>`** — shared by all **`useSWR`** hooks. */
export const swrConfigValue: SWRConfiguration = {
  fetcher: swrFetcher,
};
