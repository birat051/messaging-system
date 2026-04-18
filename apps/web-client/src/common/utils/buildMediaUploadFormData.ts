/**
 * Multipart field name for **`POST /v1/media/upload`** — **`openapi.yaml`** `multipart/form-data` **required** **`file`**.
 * Use this constant anywhere the upload body is built so it stays aligned with **`uploadMedia`** (**`mediaApi.ts`**).
 */
export const MEDIA_UPLOAD_FORM_FIELD = 'file' as const;

/**
 * Builds **`FormData`** with **`MEDIA_UPLOAD_FORM_FIELD`** per OpenAPI.
 */
export function buildMediaUploadFormData(file: File): FormData {
  const fd = new FormData();
  fd.append(MEDIA_UPLOAD_FORM_FIELD, file);
  return fd;
}
