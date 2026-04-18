import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallControls } from './CallControls';

describe('CallControls', () => {
  const noop = () => {
    /* noop for required handlers */
  };

  it('disables Answer when answerDisabled is true', () => {
    render(
      <CallControls
        phase="incoming_ring"
        micMuted={false}
        cameraOff={false}
        answerDisabled
        onAnswer={noop}
        onReject={noop}
        onToggleMute={noop}
        onToggleVideo={noop}
        onHangup={noop}
      />,
    );
    expect(screen.getByTestId('call-control-answer')).toBeDisabled();
  });

  it('incoming_ring shows Answer and Decline and invokes callbacks', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const onReject = vi.fn();

    render(
      <CallControls
        phase="incoming_ring"
        micMuted={false}
        cameraOff={false}
        onAnswer={onAnswer}
        onReject={onReject}
        onToggleMute={noop}
        onToggleVideo={noop}
        onHangup={noop}
      />,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Call controls' });
    expect(toolbar).toHaveAttribute('data-phase', 'incoming_ring');
    await user.click(within(toolbar).getByTestId('call-control-answer'));
    await user.click(within(toolbar).getByTestId('call-control-reject'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('call-control-mute')).not.toBeInTheDocument();
  });

  it('outgoing_ring shows Cancel call and invokes hangup', async () => {
    const user = userEvent.setup();
    const onHangup = vi.fn();

    render(
      <CallControls
        phase="outgoing_ring"
        micMuted={false}
        cameraOff={false}
        onAnswer={noop}
        onReject={noop}
        onToggleMute={noop}
        onToggleVideo={noop}
        onHangup={onHangup}
      />,
    );

    await user.click(screen.getByTestId('call-control-hangup'));
    expect(onHangup).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /cancel outgoing call/i }),
    ).toBeInTheDocument();
  });

  it('active shows mute, video, and hang up with aria-pressed for toggles', async () => {
    const user = userEvent.setup();
    const onMute = vi.fn();
    const onVideo = vi.fn();
    const onHangup = vi.fn();

    const { rerender } = render(
      <CallControls
        phase="active"
        micMuted={false}
        cameraOff={false}
        onAnswer={noop}
        onReject={noop}
        onToggleMute={onMute}
        onToggleVideo={onVideo}
        onHangup={onHangup}
      />,
    );

    expect(screen.getByTestId('call-control-mute')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('call-control-video')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByTestId('call-control-mute'));
    await user.click(screen.getByTestId('call-control-video'));
    await user.click(screen.getByTestId('call-control-hangup'));
    expect(onMute).toHaveBeenCalledTimes(1);
    expect(onVideo).toHaveBeenCalledTimes(1);
    expect(onHangup).toHaveBeenCalledTimes(1);

    rerender(
      <CallControls
        phase="active"
        micMuted
        cameraOff
        onAnswer={noop}
        onReject={noop}
        onToggleMute={onMute}
        onToggleVideo={onVideo}
        onHangup={onHangup}
      />,
    );
    expect(screen.getByTestId('call-control-mute')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('call-control-video')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /unmute/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /camera on/i })).toBeInTheDocument();
  });

  it('disables all buttons when disabled is true', () => {
    render(
      <CallControls
        phase="active"
        micMuted={false}
        cameraOff={false}
        disabled
        onAnswer={noop}
        onReject={noop}
        onToggleMute={noop}
        onToggleVideo={noop}
        onHangup={noop}
      />,
    );

    for (const testId of [
      'call-control-mute',
      'call-control-video',
      'call-control-hangup',
    ]) {
      expect(screen.getByTestId(testId)).toBeDisabled();
    }
  });
});
