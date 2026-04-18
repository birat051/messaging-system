import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/common/api/paths';
import { server } from '@/common/mocks/server';
import { MEDIA_UPLOAD_FORM_FIELD } from '@/common/utils/buildMediaUploadFormData';
import { useMediaUpload } from './useMediaUpload';

const MEDIA_UPLOAD = `*/v1${API_PATHS.media.upload}`;

/**
 * **MSW** + real **`httpClient`** (**`fetch`** adapter when **`MODE === 'test'`** — see **`mediaApi.ts`**).
 * The hook skips Axios **`onUploadProgress`** in tests ( **`useMediaUpload.ts`** ) so **`fetch` + MSW** multipart does not stall; **`mediaApi.test.ts`** still covers **`onUploadProgress`** / **`contentLength`** via mocked **`post`**.
 * **Production** uses the default Axios adapter (**XHR**) so upload progress is available; **`signal`** aborts in-app (**Cancel upload**).
 */
describe('useMediaUpload (MSW)', () => {
  it('POST /media/upload resolves MediaUploadResponse; progress ends at 100', async () => {
    const mediaResponse = {
      key: 'users/u-test/k-1.png',
      bucket: 'media-bucket',
      url: 'https://cdn.example.com/obj',
    } as const;

    server.use(
      http.post(MEDIA_UPLOAD, () => HttpResponse.json(mediaResponse)),
    );

    const { result } = renderHook(() => useMediaUpload());
    const file = new File(['hello-world'], 'photo.png', { type: 'image/png' });
    const appendSpy = vi.spyOn(FormData.prototype, 'append');
    await act(async () => {
      await result.current.upload(file);
    });
    expect(appendSpy).toHaveBeenCalledWith(MEDIA_UPLOAD_FORM_FIELD, file);
    appendSpy.mockRestore();

    await waitFor(() => {
      expect(result.current.result).toEqual(mediaResponse);
    });

    expect(result.current.progress).toBe(100);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('retryUpload re-POSTs after failure and resolves MediaUploadResponse', async () => {
    const mediaResponse = {
      key: 'users/u-test/k-2.png',
      bucket: 'media-bucket',
      url: null,
    } as const;
    let posts = 0;
    server.use(
      http.post(MEDIA_UPLOAD, () => {
        posts += 1;
        if (posts === 1) {
          return HttpResponse.json({ message: 'server error' }, { status: 500 });
        }
        return HttpResponse.json(mediaResponse);
      }),
    );

    const { result } = renderHook(() => useMediaUpload());
    const file = new File(['a'], 'f.bin', { type: 'application/octet-stream' });

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

    expect(posts).toBe(2);
    await waitFor(() => {
      expect(result.current.result).toEqual(mediaResponse);
    });
    expect(result.current.error).toBeNull();
  });

  it('exposes error state on failed upload; reset clears error and progress', async () => {
    server.use(
      http.post(MEDIA_UPLOAD, () =>
        HttpResponse.json({ message: 'payload too large' }, { status: 413 }),
      ),
    );

    const { result } = renderHook(() => useMediaUpload());
    const file = new File(['a'], 'f.bin', { type: 'application/octet-stream' });

    await act(async () => {
      try {
        await result.current.upload(file);
      } catch {
        /* expected */
      }
    });

    expect(result.current.error).toBeTruthy();
    /** **`MODE === 'test'`** skips **`onUploadProgress`** — percent stays **0** on failure (not **100**). */
    expect(result.current.progress).toBe(0);
    expect(result.current.isUploading).toBe(false);

    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.result).toBeNull();
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
