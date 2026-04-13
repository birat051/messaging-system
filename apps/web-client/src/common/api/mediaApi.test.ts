import { describe, expect, it, vi, beforeEach } from 'vitest';
import { API_PATHS } from './paths';

const post = vi.fn();

vi.mock('./httpClient', () => ({
  httpClient: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: {} },
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  },
}));

import { buildMediaUploadFormData } from '../utils/buildMediaUploadFormData';
import { uploadMedia } from './mediaApi';

describe('mediaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploadMedia POSTs FormData to POST /media/upload and returns MediaUploadResponse', async () => {
    post.mockResolvedValue({
      data: {
        key: 'users/u1/abc.png',
        bucket: 'media-bucket',
        url: 'https://example.com/obj',
      },
    });
    const fd = buildMediaUploadFormData(
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    const r = await uploadMedia(fd);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe(API_PATHS.media.upload);
    expect(post.mock.calls[0]?.[1]).toBeInstanceOf(FormData);
    expect(r).toEqual({
      key: 'users/u1/abc.png',
      bucket: 'media-bucket',
      url: 'https://example.com/obj',
    });
    const cfg = post.mock.calls[0]?.[2] as { transformRequest?: unknown[] };
    expect(Array.isArray(cfg?.transformRequest)).toBe(true);
  });

  it('uses contentLength when XHR total is missing so onUploadProgress still reports percent', async () => {
    const progress: number[] = [];
    post.mockImplementation(
      (
        _url: string,
        _data: unknown,
        cfg: {
          onUploadProgress?: (e: { total?: number; loaded: number }) => void;
        },
      ) => {
        cfg.onUploadProgress?.({ total: 0, loaded: 50 });
        return Promise.resolve({
          data: { key: 'k', bucket: 'b', url: null },
        });
      },
    );
    const fd = buildMediaUploadFormData(
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    await uploadMedia(fd, {
      contentLength: 100,
      onUploadProgress: (p) => {
        progress.push(p);
      },
    });
    expect(progress).toContain(50);
  });
});
