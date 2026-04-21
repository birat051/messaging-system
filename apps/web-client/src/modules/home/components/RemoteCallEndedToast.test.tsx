import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { RemoteCallEndedToast } from './RemoteCallEndedToast';
import { renderWithProviders } from '@/common/test-utils';
import { callInitialState } from '@/modules/home/stores/callSlice';

describe('RemoteCallEndedToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows when lastSessionEndReason is remote and clears after 3s', () => {
    vi.useFakeTimers();

    const { store } = renderWithProviders(<RemoteCallEndedToast />, {
      preloadedState: {
        call: {
          ...callInitialState,
          lastSessionEndReason: 'remote',
          lastRemoteEndedPeerLabel: 'Alex',
        },
      },
    });

    expect(screen.getByTestId('remote-call-ended-toast')).toHaveTextContent(
      /Alex ended the call/i,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(store.getState().call.lastSessionEndReason).toBeNull();
    expect(screen.queryByTestId('remote-call-ended-toast')).not.toBeInTheDocument();
  });

  it('renders nothing when lastSessionEndReason is not remote', () => {
    renderWithProviders(<RemoteCallEndedToast />, {
      preloadedState: {
        call: {
          ...callInitialState,
          lastSessionEndReason: 'local',
        },
      },
    });

    expect(screen.queryByTestId('remote-call-ended-toast')).not.toBeInTheDocument();
  });
});
