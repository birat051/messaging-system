import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios, { CanceledError } from 'axios';

vi.mock('@/common/api/mediaApi', () => ({
  uploadMediaViaPresignedPut: vi.fn(),
}));

import { uploadMediaViaPresignedPut } from '@/common/api/mediaApi';
import { useMediaUpload } from './useMediaUpload';

/**
 * **`uploadMediaViaPresignedPut`** must be mocked so the hook uses the same binding.
 */
describe('useMediaUpload (abort)', () => {
  beforeEach(() => {
    vi.mocked(uploadMediaViaPresignedPut).mockReset();
  });

  it('cancel() aborts the in-flight upload (AbortController)', async () => {
    vi.mocked(uploadMediaViaPresignedPut).mockImplementation((_file, opts) => {
      return new Promise((_resolve, reject) => {
        const s = opts?.signal;
        if (!s) {
          reject(new Error('expected AbortSignal'));
          return;
        }
        if (s.aborted) {
          reject(new CanceledError());
          return;
        }
        s.addEventListener(
          'abort',
          () => {
            reject(new CanceledError());
          },
          { once: true },
        );
      });
    });

    const { result } = renderHook(() => useMediaUpload());
    const file = new File(['a'], 'f.png', { type: 'image/png' });

    let caught: unknown;
    await act(async () => {
      const p = result.current.upload(file).catch((e) => {
        caught = e;
      });

      await waitFor(() => {
        expect(uploadMediaViaPresignedPut).toHaveBeenCalled();
      });
      const opts = vi.mocked(uploadMediaViaPresignedPut).mock.calls[0]?.[1];
      expect(opts?.signal).toBeDefined();

      result.current.cancel();
      await p;
    });

    expect(caught).toBeDefined();
    expect(axios.isCancel(caught)).toBe(true);
    expect(result.current.isUploading).toBe(false);
  });
});
