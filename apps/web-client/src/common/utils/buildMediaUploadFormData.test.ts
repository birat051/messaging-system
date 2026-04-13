import { describe, expect, it } from 'vitest';
import { buildMediaUploadFormData } from './buildMediaUploadFormData';

describe('buildMediaUploadFormData', () => {
  it('uses multipart field name file', () => {
    const file = new File(['a'], 'b.txt', { type: 'text/plain' });
    const fd = buildMediaUploadFormData(file);
    expect(fd.get('file')).toBe(file);
  });
});
