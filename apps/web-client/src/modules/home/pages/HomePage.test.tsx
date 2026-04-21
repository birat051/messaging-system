import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import type { components } from '@/generated/api-types';
import { API_PATHS } from '@/common/api/paths';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import { registerPathFromGuest, ROUTES } from '@/routes/paths';
import { HomePage } from './HomePage';

const sendMessageSpy = vi.hoisted(() => vi.fn());

vi.mock('@/common/hooks/useSendEncryptedMessage', async () => {
  const { mockSendMessageSocketLike } =
    await import('@/common/test-utils/mockSendMessageForVitest');
  return {
    useSendEncryptedMessage: () => ({
      sendMessage: async (
        payload: components['schemas']['SendMessageRequest'],
      ) => {
        sendMessageSpy(payload);
        return mockSendMessageSocketLike(payload);
      },
    }),
  };
});

describe('HomePage', () => {
  beforeEach(() => {
    sendMessageSpy.mockClear();
  });

  function getUserSearchBar(): HTMLElement {
    return screen.getByTestId('user-search-bar');
  }

  function getUserSearchResults(): HTMLElement {
    return screen.getByTestId('user-search-results');
  }

  it('renders the app title and a link to settings when signed in', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      },
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /ekko/i }),
    ).toBeInTheDocument();

    const settings = screen.getByRole('link', { name: /profile & settings/i });
    expect(settings).toHaveAttribute('href', ROUTES.settings);

    const bar = getUserSearchBar();
    expect(
      within(bar).getByRole('textbox', {
        name: /search users/i,
      }),
    ).toBeInTheDocument();

    const banner = screen.getByRole('banner');
    expect(
      within(banner).getByTestId('connection-status-indicator'),
    ).toBeInTheDocument();
  });

  it('does not send guest users to verify email when emailVerified is false', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: {
              id: 'guest-test-1',
              email: null,
              username: 'guest_user',
              displayName: null,
              emailVerified: false,
              profilePicture: null,
              status: null,
              guest: true,
            },
            accessToken: 'guest-token',
            accessTokenExpiresAt: null,
          },
        },
      },
    );

    expect(screen.getByTestId('home-page-shell')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^verify email$/i })).not.toBeInTheDocument();
  });

  it('shows Create account in the header for guests instead of profile settings', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: {
              id: 'guest-test-2',
              email: null,
              username: 'guest_h',
              displayName: null,
              emailVerified: false,
              profilePicture: null,
              status: null,
              guest: true,
            },
            accessToken: 'guest-token',
            accessTokenExpiresAt: null,
          },
        },
      },
    );

    const createLinks = screen.getAllByRole('link', { name: /^create account$/i });
    expect(
      createLinks.some((el) => el.getAttribute('href') === registerPathFromGuest()),
    ).toBe(true);
    expect(
      screen.queryByRole('link', { name: /profile & settings/i }),
    ).not.toBeInTheDocument();
  });

  it('debounced search: shows empty result when no stored email contains the query', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      },
    );

    const bar = getUserSearchBar();
    await user.type(
      within(bar).getByRole('textbox', {
        name: /search users/i,
      }),
      'nobody@example.com',
    );

    await waitFor(
      () => {
        expect(
          within(getUserSearchResults()).getByText(/no users match that search text/i),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });

  it('debounced search: shows name, avatar initials, and conversation ID hint', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      },
    );

    const bar = getUserSearchBar();
    await user.type(
      within(bar).getByRole('textbox', {
        name: /search users/i,
      }),
      'found@example.com',
    );

    await waitFor(
      () => {
        expect(within(getUserSearchResults()).getByText('Found User')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    expect(within(getUserSearchResults()).getByText('FU')).toBeInTheDocument();
    expect(
      within(getUserSearchResults()).getByText(/Conversation ID:/i),
    ).toBeInTheDocument();
  });

  it('debounced search: partial query matches substring of stored email', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      },
    );

    const bar = getUserSearchBar();
    await user.type(
      within(bar).getByRole('textbox', {
        name: /search users/i,
      }),
      'found',
    );

    await waitFor(
      () => {
        expect(within(getUserSearchResults()).getByText('Found User')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });

  it('debounced search: shows no-conversation hint when conversationId is absent', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      },
    );

    const bar = getUserSearchBar();
    await user.type(
      within(bar).getByRole('textbox', {
        name: /search users/i,
      }),
      'newonly@example.com',
    );

    await waitFor(
      () => {
        expect(
          within(getUserSearchResults()).getByText('New Contact'),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    expect(
      within(getUserSearchResults()).getByText(/no conversation yet/i),
    ).toBeInTheDocument();
  });

  it('new direct thread: sends recipientUserId only and stores Message.conversationId', async () => {
    const user = userEvent.setup();

    const { store } = renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      },
    );

    const bar = getUserSearchBar();
    await user.type(
      within(bar).getByRole('textbox', {
        name: /search users/i,
      }),
      'newonly@example.com',
    );

    await waitFor(
      () => {
        expect(
          within(getUserSearchResults()).getByText('New Contact'),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    await user.click(
      within(getUserSearchResults()).getByRole('button', { name: /new contact/i }),
    );

    await waitFor(() => {
      expect(store.getState().messaging.pendingDirectPeer?.userId).toBe(
        'user-new-1',
      );
    });

    const threadRegion = await screen.findByRole('region', {
      name: /conversation thread/i,
    });
    const messageBox = within(threadRegion).getByRole('textbox', {
      name: /^message$/i,
    });
    await user.type(messageBox, 'Hello there');

    await user.click(
      within(threadRegion).getByRole('button', { name: /send message/i }),
    );

    await waitFor(
      () => {
        expect(sendMessageSpy).toHaveBeenCalled();
      },
      { timeout: 4000 },
    );

    const newThreadPayload = sendMessageSpy.mock.calls.at(-1)?.[0] as
      | components['schemas']['SendMessageRequest']
      | undefined;
    expect(newThreadPayload).toMatchObject({
      recipientUserId: 'user-new-1',
      body: 'Hello there',
    });
    expect(newThreadPayload?.conversationId).toBeUndefined();
  });

  it('follow-up: send uses conversationId only (no recipientUserId) for existing thread', async () => {
    server.use(
      http.get(`*/v1${API_PATHS.conversations.list}`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'conv-7a3f9e2b-4411-4c0d-9e8a',
              title: null,
              isGroup: false,
              peerUserId: 'user-found-1',
              updatedAt: '2026-01-02T12:00:00.000Z',
            },
          ],
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
      {
        route: '/',
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      },
    );

    const bar = getUserSearchBar();
    await user.type(
      within(bar).getByRole('textbox', {
        name: /search users/i,
      }),
      'found@example.com',
    );

    await waitFor(
      () => {
        expect(within(getUserSearchResults()).getByText('Found User')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    await user.click(
      within(getUserSearchResults()).getByRole('button', { name: /found user/i }),
    );

    const threadRegion = await screen.findByRole('region', {
      name: /conversation thread/i,
    });
    const messageBox = within(threadRegion).getByRole('textbox', {
      name: /^message$/i,
    });
    await user.type(messageBox, 'Hi');

    await user.click(
      within(threadRegion).getByRole('button', { name: /send message/i }),
    );

    await waitFor(
      () => {
        expect(sendMessageSpy).toHaveBeenCalled();
      },
      { timeout: 4000 },
    );

    const captured = sendMessageSpy.mock.calls.at(-1)?.[0] as
      | components['schemas']['SendMessageRequest']
      | undefined;
    expect(captured).toMatchObject({
      conversationId: 'conv-7a3f9e2b-4411-4c0d-9e8a',
      body: 'Hi',
    });
    expect(
      (captured as { recipientUserId?: string | null } | undefined)
        ?.recipientUserId,
    ).toBeUndefined();
  });
});
