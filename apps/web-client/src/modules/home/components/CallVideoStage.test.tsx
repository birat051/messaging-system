import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallVideoStage } from './CallVideoStage';

describe('CallVideoStage', () => {
  it('renders remote video with accessible name and connecting placeholder when no remote video', () => {
    const remoteRef = createRef<HTMLVideoElement>();
    const localRef = createRef<HTMLVideoElement>();
    render(
      <CallVideoStage
        phase="outgoing_ring"
        remotePeerLabel="Pat"
        remoteVideoRef={remoteRef}
        localVideoRef={localRef}
        remoteHasVideo={false}
        localHasVideo={true}
        cameraOff={false}
      />,
    );

    expect(screen.getByTestId('call-video-stage')).toBeInTheDocument();
    expect(screen.getByTestId('call-video-remote')).toHaveAttribute(
      'aria-label',
      'Pat video',
    );
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('shows local PiP with camera off overlay when cameraOff', () => {
    const remoteRef = createRef<HTMLVideoElement>();
    const localRef = createRef<HTMLVideoElement>();
    render(
      <CallVideoStage
        phase="active"
        remotePeerLabel="Alex"
        remoteVideoRef={remoteRef}
        localVideoRef={localRef}
        remoteHasVideo={true}
        localHasVideo={false}
        cameraOff
      />,
    );

    expect(screen.getByTestId('call-video-local')).toHaveAttribute(
      'aria-label',
      'Your video',
    );
    expect(screen.getByText('Camera off')).toBeInTheDocument();
  });

  it('does not render local PiP on incoming_ring', () => {
    const remoteRef = createRef<HTMLVideoElement>();
    const localRef = createRef<HTMLVideoElement>();
    render(
      <CallVideoStage
        phase="incoming_ring"
        remotePeerLabel="Sam"
        remoteVideoRef={remoteRef}
        localVideoRef={localRef}
        remoteHasVideo={false}
        localHasVideo={false}
        cameraOff={false}
      />,
    );

    expect(screen.queryByTestId('call-video-local')).not.toBeInTheDocument();
  });
});
