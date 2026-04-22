import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/common/api/paths';
import { server } from '@/common/mocks/server';
import { ComposerAttachmentToolbar } from '@/modules/home/components/ComposerAttachmentToolbar';
import { useComposerMediaAttachment } from './useComposerMediaAttachment';

const PRESIGN = `*/v1${API_PATHS.media.presign}`;

function Harness() {
  const a = useComposerMediaAttachment();
  return (
    <ComposerAttachmentToolbar
      fileInputId="composer-attach-file"
      fileInputRef={a.fileInputRef}
      fileName={a.fileName}
      openFilePicker={a.openFilePicker}
      onFileInputChange={a.onFileInputChange}
      clearAttachment={a.clearAttachment}
      isUploading={a.isUploading}
      progress={a.progress}
      error={a.error}
      cancelUpload={a.cancelUpload}
      mediaKey={a.mediaKey}
      retryUpload={a.retryUpload}
    />
  );
}

/**
 * **File picker** → **`POST /v1/media/presign`** + **`PUT`** pre-signed URL (**`useMediaUpload`**).
 */
describe('useComposerMediaAttachment (MSW + file input)', () => {
  it('presign + PUT completes and shows ready state', async () => {
    const user = userEvent.setup();

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

    render(<Harness />);

    const input = document.getElementById(
      'composer-attach-file',
    ) as HTMLInputElement;
    /** Non-image MIME avoids **`URL.createObjectURL`** (not implemented in jsdom). */
    const file = new File(['a'], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText(/clip\.mp4/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/ready/)).toBeInTheDocument();
    });
  });
});
