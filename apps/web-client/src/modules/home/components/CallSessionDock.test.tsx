import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import { callInitialState, hangupCall } from '@/modules/home/stores/callSlice';
import { CallSessionDock } from './CallSessionDock';
import { RemoteCallEndedToast } from './RemoteCallEndedToast';

const requestLocalEndCall = vi.fn();

vi.mock('@/common/hooks/useWebRtcCallSession', () => ({
  useWebRtcCallSession: () => ({
    localVideoVisible: false,
    remoteVideoVisible: false,
    requestLocalEndCall,
    lastSessionEndReason: null,
  }),
}));

const activeCallPreload = {
  call: {
    ...callInitialState,
    phase: 'active' as const,
    callId: 'call-1',
    peerUserId: 'peer-1',
    pendingRemoteSdp: null,
    peerResolvedLabel: 'Taylor',
  },
};

describe('CallSessionDock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('remote hangup: dock unmounts, peer-ended toast appears and clears after 3s', () => {
    vi.useFakeTimers();

    const { store } = renderWithProviders(
      <>
        <CallSessionDock
          activeConversationId="conv-1"
          isGroupThread={false}
          selectedPeerUserId="peer-1"
          peerDisplayName="Taylor"
        />
        <RemoteCallEndedToast />
      </>,
      { preloadedState: activeCallPreload },
    );

    expect(screen.getByTestId('call-session-dock')).toBeInTheDocument();

    act(() => {
      store.dispatch(hangupCall({ reason: 'remote' }));
    });

    expect(screen.queryByTestId('call-session-dock')).not.toBeInTheDocument();
    expect(screen.getByTestId('remote-call-ended-toast')).toHaveTextContent(
      /Taylor ended the call/i,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId('remote-call-ended-toast')).not.toBeInTheDocument();
    expect(store.getState().call.lastSessionEndReason).toBeNull();
  });

  it('local hangup: dock unmounts without peer-ended toast', () => {
    const { store } = renderWithProviders(
      <>
        <CallSessionDock
          activeConversationId="conv-1"
          isGroupThread={false}
          selectedPeerUserId="peer-1"
          peerDisplayName="Taylor"
        />
        <RemoteCallEndedToast />
      </>,
      { preloadedState: activeCallPreload },
    );

    expect(screen.getByTestId('call-session-dock')).toBeInTheDocument();

    act(() => {
      store.dispatch(hangupCall({ reason: 'local' }));
    });

    expect(screen.queryByTestId('call-session-dock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('remote-call-ended-toast')).not.toBeInTheDocument();
  });

  it('starts fullscreen with Minimize; minimized shows Expand and compact video layout', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <CallSessionDock
        activeConversationId="conv-1"
        isGroupThread={false}
        selectedPeerUserId="peer-1"
        peerDisplayName="Taylor"
      />,
      {
        preloadedState: activeCallPreload,
      },
    );

    const dock = screen.getByTestId('call-session-dock');
    expect(dock).toHaveAttribute('data-call-chrome', 'fullscreen');
    expect(screen.getByTestId('call-minimize')).toBeInTheDocument();
    expect(screen.queryByTestId('call-expand')).not.toBeInTheDocument();
    expect(screen.getByTestId('call-video-stage')).toHaveAttribute(
      'data-layout',
      'default',
    );

    await user.click(screen.getByTestId('call-minimize'));

    expect(dock).toHaveAttribute('data-call-chrome', 'minimized');
    expect(screen.getByTestId('call-expand')).toBeInTheDocument();
    expect(screen.queryByTestId('call-minimize')).not.toBeInTheDocument();
    expect(screen.getByTestId('call-video-stage')).toHaveAttribute(
      'data-layout',
      'compact',
    );

    await user.click(screen.getByTestId('call-expand'));

    expect(dock).toHaveAttribute('data-call-chrome', 'fullscreen');
    expect(screen.getByTestId('call-minimize')).toBeInTheDocument();
  });

  it('shows ringing copy in fullscreen header for incoming_ring', () => {
    renderWithProviders(
      <CallSessionDock
        activeConversationId="conv-1"
        isGroupThread={false}
        selectedPeerUserId="peer-1"
        peerDisplayName="Jordan"
      />,
      {
        preloadedState: {
          call: {
            ...callInitialState,
            phase: 'incoming_ring',
            callId: 'call-1',
            peerUserId: 'peer-1',
            pendingRemoteSdp: 'v=0\r\n',
          },
        },
      },
    );

    expect(screen.getByRole('region', { name: /incoming call.*jordan/i })).toBeInTheDocument();
    expect(screen.getByTestId('call-session-dock')).toHaveAttribute(
      'data-call-chrome',
      'fullscreen',
    );
  });
});
