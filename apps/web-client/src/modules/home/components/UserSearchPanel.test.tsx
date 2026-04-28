import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SEARCH_DEBOUNCE_MS } from '@/modules/home/hooks/useUserSearchQuery';
import { UserSearchPanel } from './UserSearchPanel';
import {
  renderWithProviders,
  type PreloadedRootState,
} from '@/common/test-utils';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';

const guestPanelPreload: PreloadedRootState = {
  auth: {
    user: {
      id: 'guest-x',
      email: null,
      username: 'sandbox',
      displayName: null,
      emailVerified: false,
      profilePicture: null,
      status: null,
      guest: true,
    },
    accessToken: 't',
    accessTokenExpiresAt: null,
  },
};

describe('UserSearchPanel', () => {
  it('uses guest-only copy when the user is a guest', () => {
    renderWithProviders(<UserSearchPanel />, {
      preloadedState: guestPanelPreload,
    });

    expect(
      screen.getByRole('heading', { name: /find other guests/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /search guests/i }),
    ).toBeInTheDocument();
  });

  it('shows guest sandbox directory blurb', () => {
    renderWithProviders(<UserSearchPanel />, {
      preloadedState: guestPanelPreload,
    });

    expect(
      screen.getByText(/registered accounts are not listed here/i),
    ).toBeInTheDocument();
  });

  it('uses standard copy for registered users', () => {
    renderWithProviders(<UserSearchPanel />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser },
          accessToken: 't',
          accessTokenExpiresAt: null,
        },
      },
    });

    expect(
      screen.getByRole('heading', { name: /find someone/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /search users/i }),
    ).toBeInTheDocument();
  });

  it('guest empty results: sandbox empty copy and link to register for full directory', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/v1/users/search', () => HttpResponse.json([])),
    );

    renderWithProviders(<UserSearchPanel />, {
      preloadedState: guestPanelPreload,
      route: '/',
    });

    await user.type(screen.getByRole('textbox', { name: /search guests/i }), 'zzz');

    await waitFor(() => {
      expect(
        screen.getByText(/no other guests match that text/i),
      ).toBeInTheDocument();
    });

    const fullDirectoryLink = screen.getByRole('link', {
      name: /create an account/i,
    });
    expect(fullDirectoryLink).toHaveAttribute('href', '/register?from=guest');
  });

  it('guest search error: shows API message plus register hint for full directory', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/v1/users/search', () =>
        HttpResponse.json(
          { code: 'TOO_MANY_REQUESTS', message: 'Slow down' },
          { status: 429 },
        ),
      ),
    );

    renderWithProviders(<UserSearchPanel />, {
      preloadedState: guestPanelPreload,
      route: '/',
    });

    await user.type(screen.getByRole('textbox', { name: /search guests/i }), 'abc');

    await waitFor(() => {
      expect(screen.getByText('Slow down')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/guest search never includes registered users/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^register$/i })).toHaveAttribute(
      'href',
      '/register?from=guest',
    );
  });

  it('guest search with one guest hit: count copy and guest row label', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/v1/users/search', () =>
        HttpResponse.json([
          {
            userId: 'peer-1',
            username: 'peer_guest',
            displayName: 'Peer Guest',
            profilePicture: null,
            conversationId: null,
            guest: true,
          },
        ]),
      ),
    );

    renderWithProviders(<UserSearchPanel />, {
      preloadedState: guestPanelPreload,
      route: '/',
    });

    await user.type(screen.getByRole('textbox', { name: /search guests/i }), 'pee');

    await waitFor(() => {
      expect(screen.getByText(/found 1 other guest/i)).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /peer guest/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('(Guest)')).toBeInTheDocument();
  });
});

const registeredPreload: PreloadedRootState = {
  auth: {
    user: { ...defaultMockUser },
    accessToken: 't',
    accessTokenExpiresAt: null,
  },
};

describe('UserSearchPanel — debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces search (no HTTP until debounce elapses)', async () => {
    let requestCount = 0;
    server.use(
      http.get('*/v1/users/search', () => {
        requestCount += 1;
        return HttpResponse.json([]);
      }),
    );

    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    renderWithProviders(<UserSearchPanel />, {
      preloadedState: registeredPreload,
      route: '/',
    });

    const input = screen.getByRole('textbox', { name: /search users/i });
    await user.type(input, 'abc');
    expect(requestCount).toBe(0);

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    await waitFor(() => {
      expect(requestCount).toBe(1);
    });
  });

  it('registered user: empty state after search (inline)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    server.use(http.get('*/v1/users/search', () => HttpResponse.json([])));

    renderWithProviders(<UserSearchPanel />, {
      preloadedState: registeredPreload,
      route: '/',
    });

    const input = screen.getByRole('textbox', { name: /search users/i });
    await user.type(input, 'xyz');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    await waitFor(() => {
      expect(screen.getByText(/no users match that search text/i)).toBeInTheDocument();
    });
  });
});
