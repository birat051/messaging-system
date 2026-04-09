import type { components } from '../../generated/api-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

type S = components['schemas'];

/** Multipart field **`file`** per OpenAPI. */
export async function uploadMedia(formData: FormData): Promise<S['MediaUploadResponse']> {
  const res = await httpClient.post<S['MediaUploadResponse']>(API_PATHS.media.upload, formData);
  return res.data;
}
