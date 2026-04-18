import { describe, expect, it } from 'vitest';
import {
  buildMediaUploadFormData,
  MEDIA_UPLOAD_FORM_FIELD,
} from './buildMediaUploadFormData';

describe('buildMediaUploadFormData', () => {
  it('uses OpenAPI multipart field name file', () => {
    expect(MEDIA_UPLOAD_FORM_FIELD).toBe('file');
    const file = new File(['a'], 'b.txt', { type: 'text/plain' });
    const fd = buildMediaUploadFormData(file);
    expect(fd.get(MEDIA_UPLOAD_FORM_FIELD)).toBe(file);
  });
});
