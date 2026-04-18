import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/common/api/paths';
import { server } from '@/common/mocks/server';
import { ComposerAttachmentToolbar } from '@/modules/home/components/ComposerAttachmentToolbar';
import { useComposerMediaAttachment } from './useComposerMediaAttachment';

const MEDIA_UPLOAD = `*/v1${API_PATHS.media.upload}`;

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
 * **File picker** → **`buildMediaUploadFormData`** (OpenAPI **`file`**) → **`uploadMedia`** (**`mediaApi.ts`**).
 * **Note:** MSW handlers that **`await request.formData()`** can deadlock with Axios **`fetch`** + multipart in Vitest; the **`file`** part name is asserted in **`buildMediaUploadFormData.test.ts`** and **`useMediaUpload.test.tsx`**.
 */
describe('useComposerMediaAttachment (MSW + file input)', () => {
  it('POST /media/upload uses multipart field file per OpenAPI', async () => {
    const user = userEvent.setup();
    const mediaResponse = {
      key: 'users/u-test/k-1.png',
      bucket: 'media-bucket',
      url: 'https://cdn.example.com/obj',
    } as const;

    server.use(
      http.post(MEDIA_UPLOAD, () => HttpResponse.json(mediaResponse)),
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
