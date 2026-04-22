import { describe, expect, it, vi, beforeEach } from 'vitest';
import { API_PATHS } from './paths';

const post = vi.fn();
const putBlobToPresignedUrl = vi.fn().mockResolvedValue(undefined);

vi.mock('../utils/presignedObjectUpload', () => ({
  putBlobToPresignedUrl: (...args: unknown[]) => putBlobToPresignedUrl(...args),
}));

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
import { uploadMedia, uploadMediaViaPresignedPut } from './mediaApi';

describe('mediaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putBlobToPresignedUrl.mockResolvedValue(undefined);
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

  it('forwards AbortSignal to axios post for cancel', async () => {
    post.mockResolvedValue({
      data: { key: 'k', bucket: 'b', url: null },
    });
    const ac = new AbortController();
    const fd = buildMediaUploadFormData(
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    await uploadMedia(fd, { signal: ac.signal });
    const cfg = post.mock.calls[0]?.[2] as { signal?: AbortSignal };
    expect(cfg?.signal).toBe(ac.signal);
  });

  it('uploadMediaViaPresignedPut posts presign then PUTs file with returned headers', async () => {
    post.mockResolvedValueOnce({
      data: {
        method: 'PUT',
        url: 'https://example.r2.dev/bucket/presigned',
        key: 'users/u1/obj.png',
        bucket: 'my-bucket',
        expiresAt: '2026-01-01T12:00:00.000Z',
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': '5',
        },
      },
    });
    const file = new File([new Uint8Array(5)], 'shot.png', { type: 'image/png' });
    const r = await uploadMediaViaPresignedPut(file);
    expect(post.mock.calls[0]?.[0]).toBe(API_PATHS.media.presign);
    expect(post.mock.calls[0]?.[1]).toEqual({
      contentType: 'image/png',
      contentLength: 5,
      filename: 'shot.png',
    });
    expect(putBlobToPresignedUrl).toHaveBeenCalledTimes(1);
    const putArgs = putBlobToPresignedUrl.mock.calls[0]!;
    expect(putArgs[0]).toBe('https://example.r2.dev/bucket/presigned');
    expect(putArgs[1]).toBe(file);
    expect(putArgs[2]?.headers).toEqual({
      'Content-Type': 'image/png',
      'Content-Length': '5',
    });
    expect(r).toEqual({
      key: 'users/u1/obj.png',
      bucket: 'my-bucket',
      url: null,
    });
  });

  it('uploadMediaViaPresignedPut rejects unsupported MIME', async () => {
    await expect(
      uploadMediaViaPresignedPut(
        new File(['x'], 'x.bin', { type: 'application/octet-stream' }),
      ),
    ).rejects.toThrow(/unsupported/i);
    expect(post).not.toHaveBeenCalled();
  });

  it('uploadMediaViaPresignedPut rejects when file exceeds VITE_MEDIA_UPLOAD_MAX_BYTES', async () => {
    vi.stubEnv('VITE_MEDIA_UPLOAD_MAX_BYTES', '100');
    try {
      const file = new File([new Uint8Array(200)], 'huge.png', { type: 'image/png' });
      await expect(uploadMediaViaPresignedPut(file)).rejects.toThrow(/too large/i);
      expect(post).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
