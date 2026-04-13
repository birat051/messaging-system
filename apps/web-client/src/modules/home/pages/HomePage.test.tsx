import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import type { components } from '@/generated/api-types';
import { defaultMockUser } from '@/common/mocks/handlers';
import { renderWithProviders } from '@/common/test-utils';
import { ROUTES } from '@/routes/paths';
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
  it('renders the app title and a link to settings when signed in', () => {
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
      screen.getByRole('heading', { level: 1, name: /messaging/i }),
    ).toBeInTheDocument();

    const settings = screen.getByRole('link', { name: /profile & settings/i });
    expect(settings).toHaveAttribute('href', ROUTES.settings);

    const searchPanel = screen.getByTestId('user-search-panel');
    expect(
      within(searchPanel).getByRole('textbox', {
        name: /search users/i,
      }),
    ).toBeInTheDocument();

    const banner = screen.getByRole('banner');
    expect(
      within(banner).getByTestId('connection-status-indicator'),
    ).toBeInTheDocument();
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

    const searchPanel = screen.getByTestId('user-search-panel');
    await user.type(
      within(searchPanel).getByRole('textbox', {
        name: /search users/i,
      }),
      'nobody@example.com',
    );

    await waitFor(
      () => {
        expect(
          within(searchPanel).getByText(/no users match that search text/i),
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

    const searchPanel = screen.getByTestId('user-search-panel');
    await user.type(
      within(searchPanel).getByRole('textbox', {
        name: /search users/i,
      }),
      'found@example.com',
    );

    await waitFor(
      () => {
        expect(within(searchPanel).getByText('Found User')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    expect(within(searchPanel).getByText('FU')).toBeInTheDocument();
    expect(
      within(searchPanel).getByText(/Conversation ID:/i),
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

    const searchPanel = screen.getByTestId('user-search-panel');
    await user.type(
      within(searchPanel).getByRole('textbox', {
        name: /search users/i,
      }),
      'found',
    );

    await waitFor(
      () => {
        expect(within(searchPanel).getByText('Found User')).toBeInTheDocument();
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

    const searchPanel = screen.getByTestId('user-search-panel');
    await user.type(
      within(searchPanel).getByRole('textbox', {
        name: /search users/i,
      }),
      'newonly@example.com',
    );

    await waitFor(
      () => {
        expect(
          within(searchPanel).getByText('New Contact'),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    expect(
      within(searchPanel).getByText(/no conversation yet/i),
    ).toBeInTheDocument();
  });

  it('new direct thread: sends recipientUserId only and stores Message.conversationId', async () => {
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

    const searchPanel = screen.getByTestId('user-search-panel');
    await user.type(
      within(searchPanel).getByRole('textbox', {
        name: /search users/i,
      }),
      'newonly@example.com',
    );

    await waitFor(
      () => {
        expect(
          within(searchPanel).getByText('New Contact'),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    await user.click(
      within(searchPanel).getByRole('button', { name: /new contact/i }),
    );

    const messageBox = within(searchPanel).getByRole('textbox', {
      name: /^message$/i,
    });
    await user.type(messageBox, 'Hello there');

    await user.click(
      within(searchPanel).getByRole('button', { name: /send message/i }),
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('stored-conversation-id')).toHaveTextContent(
          'conv-user-new-1-thread',
        );
      },
      { timeout: 4000 },
    );

    expect(
      within(searchPanel).getByRole('heading', { name: /continue thread/i }),
    ).toBeInTheDocument();
    expect(
      within(searchPanel).getByRole('form', {
        name: /send message in thread with new contact/i,
      }),
    ).toBeInTheDocument();
  });

  it('follow-up: send uses conversationId only (no recipientUserId) for existing thread', async () => {
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

    const searchPanel = screen.getByTestId('user-search-panel');
    await user.type(
      within(searchPanel).getByRole('textbox', {
        name: /search users/i,
      }),
      'found@example.com',
    );

    await waitFor(
      () => {
        expect(within(searchPanel).getByText('Found User')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    await user.click(
      within(searchPanel).getByRole('button', { name: /found user/i }),
    );

    const messageBox = within(searchPanel).getByRole('textbox', {
      name: /^message$/i,
    });
    await user.type(messageBox, 'Hi');

    await user.click(
      within(searchPanel).getByRole('button', { name: /send message/i }),
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
