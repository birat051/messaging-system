import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';

describe('ConnectionStatusIndicator', () => {
  it('renders a status region with a short label for connecting state', () => {
    renderWithProviders(<ConnectionStatusIndicator />, {
      preloadedState: {
        connection: { presenceStatus: { kind: 'connecting' } },
      },
    });

    const region = screen.getByTestId('connection-status-indicator');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('data-variant', 'connecting');
    expect(region).toHaveTextContent(/connecting/i);
  });

  it('shows connected variant and label when the socket is up', () => {
    renderWithProviders(<ConnectionStatusIndicator />, {
      preloadedState: {
        connection: {
          presenceStatus: { kind: 'connected', socketId: 'sk_test_123' },
        },
      },
    });

    const region = screen.getByTestId('connection-status-indicator');
    expect(region).toHaveAttribute('data-variant', 'connected');
    expect(region).toHaveTextContent(/connected/i);
  });

  it('shows disconnected variant when the worker reports a disconnect', () => {
    renderWithProviders(<ConnectionStatusIndicator />, {
      preloadedState: {
        connection: {
          presenceStatus: { kind: 'disconnected', reason: 'io server disconnect' },
        },
      },
    });

    const region = screen.getByTestId('connection-status-indicator');
    expect(region).toHaveAttribute('data-variant', 'disconnected');
    expect(region).toHaveTextContent(/disconnected/i);
  });

  it('shows error variant when connect_error was reported', () => {
    renderWithProviders(<ConnectionStatusIndicator />, {
      preloadedState: {
        connection: {
          presenceStatus: { kind: 'error', message: 'xhr poll error' },
        },
      },
    });

    const region = screen.getByTestId('connection-status-indicator');
    expect(region).toHaveAttribute('data-variant', 'error');
    expect(region).toHaveTextContent(/connection error/i);
  });

  it('shows idle variant when presence is idle (e.g. signed out or not yet bridged)', () => {
    renderWithProviders(<ConnectionStatusIndicator />, {
      preloadedState: {
        connection: { presenceStatus: { kind: 'idle' } },
      },
    });

    const region = screen.getByTestId('connection-status-indicator');
    expect(region).toHaveAttribute('data-variant', 'idle');
    expect(region).toHaveTextContent(/not connected/i);
  });

  it('uses a decorative dot only (no duplicate icon announcement)', () => {
    renderWithProviders(<ConnectionStatusIndicator />, {
      preloadedState: {
        connection: { presenceStatus: { kind: 'connected' } },
      },
    });

    const dot = screen.getByTestId('connection-status-dot');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes full presence detail in title for hover and assistive context', () => {
    renderWithProviders(<ConnectionStatusIndicator />, {
      preloadedState: {
        connection: {
          presenceStatus: { kind: 'disconnected', reason: 'transport close' },
        },
      },
    });

    const region = screen.getByTestId('connection-status-indicator');
    expect(region).toHaveAttribute('title');
    const title = region.getAttribute('title') ?? '';
    expect(title.toLowerCase()).toMatch(/presence/);
    expect(title.toLowerCase()).toMatch(/disconnect/);
  });
});
