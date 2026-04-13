/**
 * Builds **`FormData`** with the **`file`** field name required by **`POST /v1/media/upload`** (OpenAPI).
 */
export function buildMediaUploadFormData(file: File): FormData {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
}
