import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import { ThreadComposer } from './ThreadComposer';

const attachment = vi.hoisted(() => ({
  mediaKey: null as string | null,
  imagePreviewUrl: null as string | null,
  mediaPreviewUrl: null as string | null,
  clearAttachment: vi.fn(),
}));

vi.mock('@/common/hooks/useComposerMediaAttachment', () => ({
  useComposerMediaAttachment: () => ({
    fileInputRef: { current: null },
    fileName: attachment.mediaKey ? 'photo.png' : null,
    imagePreviewUrl: attachment.imagePreviewUrl,
    mediaPreviewUrl: attachment.mediaPreviewUrl,
    openFilePicker: vi.fn(),
    onFileInputChange: vi.fn(),
    clearAttachment: attachment.clearAttachment,
    mediaKey: attachment.mediaKey,
    isUploading: false,
    progress: null,
    error: null,
    cancelUpload: vi.fn(),
    retryUpload: vi.fn(),
  }),
}));

describe('ThreadComposer', () => {
  beforeEach(() => {
    attachment.mediaKey = null;
    attachment.imagePreviewUrl = null;
    attachment.mediaPreviewUrl = null;
    attachment.clearAttachment.mockClear();
  });

  it('shows image preview strip when hook exposes imagePreviewUrl', () => {
    attachment.imagePreviewUrl = 'blob:preview-test';
    renderWithProviders(<ThreadComposer onSend={vi.fn()} />);
    expect(screen.getByTestId('composer-image-preview-strip')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /pending attachment preview/i }),
    ).toHaveAttribute('src', 'blob:preview-test');
  });

  it('submits trimmed text via onSend and clears the field', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: /^message$/i });
    await user.type(input, '  Hello world  ');
    const sendBtn = screen.getByRole('button', { name: /send message/i });
    expect(sendBtn).toHaveClass('min-h-11', 'touch-manipulation');
    await user.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith({
      text: 'Hello world',
      mediaKey: null,
      mediaPreviewUrl: null,
    });
    expect(input).toHaveValue('');
    expect(attachment.clearAttachment).toHaveBeenCalled();
  });

  it('submits mediaKey when attachment is ready and clears', async () => {
    attachment.mediaKey = 'users/me/obj.png';
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(onSend).toHaveBeenCalledWith({
      text: '',
      mediaKey: 'users/me/obj.png',
      mediaPreviewUrl: null,
    });
    expect(attachment.clearAttachment).toHaveBeenCalled();
  });

  it('passes mediaPreviewUrl with mediaKey for optimistic display (e.g. blob)', async () => {
    attachment.mediaKey = 'users/me/obj.png';
    attachment.mediaPreviewUrl = 'blob:local-preview';
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(onSend).toHaveBeenCalledWith({
      text: '',
      mediaKey: 'users/me/obj.png',
      mediaPreviewUrl: 'blob:local-preview',
    });
  });

  it('does not submit or call onSend when the message is empty', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(onSend).not.toHaveBeenCalled();

    const sendBtn = screen.getByRole('button', { name: /send message/i });
    expect(sendBtn).toBeDisabled();
  });

  it('disables send while submitting', async () => {
    const user = userEvent.setup();
    let resolveSend!: (value: void) => void;
    const pending = new Promise<void>((r) => {
      resolveSend = r;
    });
    const onSend = vi.fn(() => pending);

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    await user.type(screen.getByRole('textbox', { name: /^message$/i }), 'x');
    const sendPromise = user.click(
      screen.getByRole('button', { name: /send message/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    });

    resolveSend();
    await sendPromise;
  });

  it('shows Sending… on the submit button while submitting', async () => {
    const user = userEvent.setup();
    let resolveSend!: (value: void) => void;
    const pending = new Promise<void>((r) => {
      resolveSend = r;
    });
    const onSend = vi.fn(() => pending);

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    await user.type(screen.getByRole('textbox', { name: /^message$/i }), 'hi');
    void user.click(screen.getByRole('button', { name: /send message/i }));

    expect(
      await screen.findByRole('button', { name: /sending/i }),
    ).toBeInTheDocument();

    resolveSend!();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /send message/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows an alert when onSend rejects', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockRejectedValue(new Error('Network error'));

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    await user.type(screen.getByRole('textbox', { name: /^message$/i }), 'hi');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
    expect(screen.getByRole('textbox', { name: /^message$/i })).toHaveValue('hi');
  });

  it('shows an external errorMessage from the parent', () => {
    renderWithProviders(
      <ThreadComposer onSend={vi.fn()} errorMessage="Too many requests" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests');
  });

  it('calls onExternalErrorClear when the user types while errorMessage is set', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    renderWithProviders(
      <ThreadComposer
        onSend={vi.fn()}
        errorMessage="Rate limited"
        onExternalErrorClear={onClear}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: /^message$/i }), 'a');
    expect(onClear).toHaveBeenCalled();
  });
});
