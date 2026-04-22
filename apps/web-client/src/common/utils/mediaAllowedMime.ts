import type { components } from '@/generated/api-types';

/** OpenAPI **`MediaPresignContentType`** / **`POST /media/upload`** allowlist — keep aligned with messaging-service. */
export const MEDIA_UPLOAD_ALLOWED_MIME_TYPES: readonly components['schemas']['MediaPresignContentType'][] =
  [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/ogg',
  ] as const;

const EXT_TO_MIME = new Map<string, components['schemas']['MediaPresignContentType']>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mov', 'video/quicktime'],
  ['.ogv', 'video/ogg'],
]);

export function isAllowedMediaMimeType(
  mime: string,
): mime is components['schemas']['MediaPresignContentType'] {
  return (MEDIA_UPLOAD_ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Resolves **`File.type`** when the browser leaves it empty (some mobile / picker paths).
 */
export function resolveMediaMimeForUpload(file: File): string | null {
  const t = file.type?.trim();
  if (t && isAllowedMediaMimeType(t)) {
    return t;
  }
  const name = file.name?.toLowerCase() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot === -1) {
    return null;
  }
  const ext = name.slice(dot);
  return EXT_TO_MIME.get(ext) ?? null;
}
