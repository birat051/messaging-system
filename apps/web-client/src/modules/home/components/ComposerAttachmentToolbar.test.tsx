import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import {
  ComposerAttachmentToolbar,
  type ComposerAttachmentToolbarProps,
} from './ComposerAttachmentToolbar';

function base(): ComposerAttachmentToolbarProps {
  return {
    fileInputRef: { current: null },
    fileName: null,
    openFilePicker: vi.fn(),
    onFileInputChange: vi.fn(),
    clearAttachment: vi.fn(),
    isUploading: false,
    progress: null,
    error: null,
    cancelUpload: vi.fn(),
    mediaKey: null,
    retryUpload: vi.fn(),
    fileInputId: 'test-file-input',
  };
}

describe('ComposerAttachmentToolbar', () => {
  it('shows a determinate progress bar and label while uploading', () => {
    renderWithProviders(
      <ComposerAttachmentToolbar
        {...base()}
        isUploading
        progress={42}
      />,
    );

    const bar = screen.getByRole('progressbar', { name: /upload progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText(/uploading 42%/i)).toBeInTheDocument();
  });

  it('offers Retry upload after an error when a file was chosen', async () => {
    const user = userEvent.setup();
    const retryUpload = vi.fn();

    renderWithProviders(
      <ComposerAttachmentToolbar
        {...base()}
        fileName="photo.png"
        error="Request failed"
        retryUpload={retryUpload}
      />,
    );

    await user.click(screen.getByRole('button', { name: /retry upload/i }));
    expect(retryUpload).toHaveBeenCalledTimes(1);
  });

  it('does not show Retry when upload succeeded (mediaKey set)', () => {
    renderWithProviders(
      <ComposerAttachmentToolbar
        {...base()}
        fileName="photo.png"
        error="Stale error"
        mediaKey="users/1/key.png"
        retryUpload={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /retry upload/i })).not.toBeInTheDocument();
  });
});
