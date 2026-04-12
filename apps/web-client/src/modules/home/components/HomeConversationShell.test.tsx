import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { components } from '@/generated/api-types';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import { HomeConversationShell } from './HomeConversationShell';

type Conversation = components['schemas']['Conversation'];

vi.mock('@/common/hooks/useSendEncryptedMessage', async () => {
  const { mockSendMessageSocketLike } = await import(
    '@/common/test-utils/mockSendMessageForVitest'
  );
  return {
    useSendEncryptedMessage: () => ({
      sendMessage: async (payload: components['schemas']['SendMessageRequest']) =>
        mockSendMessageSocketLike(payload),
    }),
  };
});

describe('HomeConversationShell', () => {
  it('shows empty list when API returns no items', async () => {
    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    expect(await screen.findByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it('selecting a row sets active selection and updates the main pane', async () => {
    const u = userEvent.setup();
    const items: Conversation[] = [
      {
        id: 'conv-aaa',
        title: null,
        isGroup: false,
        peerUserId: 'peer-aaa',
        updatedAt: '2026-01-01T12:00:00.000Z',
      },
      {
        id: 'conv-bbb',
        title: null,
        isGroup: false,
        peerUserId: 'peer-bbb',
        updatedAt: '2026-01-02T12:00:00.000Z',
      },
    ];

    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items,
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    const shell = await screen.findByTestId('home-conversation-shell');
    const buttons = await within(shell).findAllByRole('button');
    expect(buttons).toHaveLength(2);

    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');

    await u.click(buttons[1]!);

    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');

    expect(
      await within(shell).findByText(/no messages yet/i),
    ).toBeInTheDocument();

    expect(
      await within(shell).findByTestId('e2ee-messaging-indicator'),
    ).toBeInTheDocument();
    expect(
      within(shell).getByTestId('e2ee-messaging-indicator'),
    ).toHaveTextContent(/end-to-end encrypted/i);
  });
});
