import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import { ThreadComposer } from './ThreadComposer';

describe('ThreadComposer', () => {
  it('submits trimmed text via onSend and clears the field', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: /^message$/i });
    await user.type(input, '  Hello world  ');
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(onSend).toHaveBeenCalledWith('Hello world');
    expect(input).toHaveValue('');
  });

  it('does not submit or call onSend when the message is empty', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    await user.click(screen.getByRole('button', { name: /^send$/i }));
    expect(onSend).not.toHaveBeenCalled();

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
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
    const sendPromise = user.click(screen.getByRole('button', { name: /^send$/i }));

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
    void user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(
      await screen.findByRole('button', { name: /sending/i }),
    ).toBeInTheDocument();

    resolveSend!();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^send$/i })).toBeInTheDocument();
    });
  });

  it('shows an alert when onSend rejects', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockRejectedValue(new Error('Network error'));

    renderWithProviders(<ThreadComposer onSend={onSend} />);

    await user.type(screen.getByRole('textbox', { name: /^message$/i }), 'hi');
    await user.click(screen.getByRole('button', { name: /^send$/i }));

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
