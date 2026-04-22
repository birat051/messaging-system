import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/common/api/paths';
import { server } from '@/common/mocks/server';
import { useMediaUpload } from './useMediaUpload';

const PRESIGN = `*/v1${API_PATHS.media.presign}`;

/**
 * **MSW** + **`POST /v1/media/presign`** + **`PUT`** pre-signed URL (**`useMediaUpload`**).
 * **`onUploadProgress`** is skipped in **`MODE === 'test'`** for **`PUT`** (see **`uploadMediaViaPresignedPut`**).
 */
describe('useMediaUpload (MSW, presign + PUT)', () => {
  it('presign + PUT resolves MediaUploadResponse; progress ends at 100', async () => {
    server.use(
      http.post(PRESIGN, async ({ request }) => {
        const body = (await request.json()) as {
          contentType: string;
          contentLength: number;
        };
        return HttpResponse.json({
          method: 'PUT',
          url: 'https://r2.example/presigned-put-target',
          key: 'users/u-test/k-1.png',
          bucket: 'media-bucket',
          expiresAt: '2026-01-01T12:00:00.000Z',
          headers: {
            'Content-Type': body.contentType,
            'Content-Length': String(body.contentLength),
          },
        });
      }),
      http.put('https://r2.example/presigned-put-target', () =>
        HttpResponse.json(null, { status: 200 }),
      ),
    );

    const { result } = renderHook(() => useMediaUpload());
    const file = new File(['hello-world'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      await result.current.upload(file);
    });

    await waitFor(() => {
      expect(result.current.result).toEqual({
        key: 'users/u-test/k-1.png',
        bucket: 'media-bucket',
        url: null,
      });
    });

    expect(result.current.progress).toBe(100);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('retryUpload re-runs presign + PUT after failure and resolves MediaUploadResponse', async () => {
    let presignCalls = 0;
    server.use(
      http.post(PRESIGN, () => {
        presignCalls += 1;
        if (presignCalls === 1) {
          return HttpResponse.json({ message: 'server error' }, { status: 500 });
        }
        return HttpResponse.json({
          method: 'PUT',
          url: 'https://r2.example/retry-target',
          key: 'users/u-test/k-2.png',
          bucket: 'media-bucket',
          expiresAt: '2026-01-01T12:00:00.000Z',
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': '1',
          },
        });
      }),
      http.put('https://r2.example/retry-target', () =>
        HttpResponse.json(null, { status: 200 }),
      ),
    );

    const { result } = renderHook(() => useMediaUpload());
    const file = new File(['x'], 'f.png', { type: 'image/png' });

    await act(async () => {
      try {
        await result.current.upload(file);
      } catch {
        /* expected */
      }
    });
    expect(result.current.error).toBeTruthy();

    await act(async () => {
      await result.current.retryUpload();
    });

    expect(presignCalls).toBe(2);
    await waitFor(() => {
      expect(result.current.result).toEqual({
        key: 'users/u-test/k-2.png',
        bucket: 'media-bucket',
        url: null,
      });
    });
    expect(result.current.error).toBeNull();
  });

  it('exposes error state on failed upload; reset clears error and progress', async () => {
    server.use(
      http.post(PRESIGN, () =>
        HttpResponse.json({ message: 'payload too large' }, { status: 413 }),
      ),
    );

    const { result } = renderHook(() => useMediaUpload());
    const file = new File(['a'], 'f.png', { type: 'image/png' });

    await act(async () => {
      try {
        await result.current.upload(file);
      } catch {
        /* expected */
      }
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.progress).toBe(0);
    expect(result.current.isUploading).toBe(false);

    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('rejects file over VITE_MEDIA_UPLOAD_MAX_BYTES before presign', async () => {
    vi.stubEnv('VITE_MEDIA_UPLOAD_MAX_BYTES', '10');
    const presignSpy = vi.fn();
    server.use(
      http.post(PRESIGN, () => {
        presignSpy();
        return HttpResponse.json({ message: 'unexpected' }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useMediaUpload());
    const file = new File([new Uint8Array(20)], 'big.bin', { type: 'image/png' });

    await act(async () => {
      try {
        await result.current.upload(file);
      } catch {
        /* expected */
      }
    });

    expect(presignSpy).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/too large/i);
    vi.unstubAllEnvs();
  });

  it('web-client package.json has no aws-sdk / @aws-sdk (upload via REST only)', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(dir, '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    const aws = names.filter(
      (n) => n === 'aws-sdk' || n.startsWith('@aws-sdk/'),
    );
    expect(aws).toEqual([]);
  });
});
