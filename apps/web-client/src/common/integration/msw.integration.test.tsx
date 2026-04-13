import { useEffect, useState } from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { listConversations } from '@/common/api/conversationsApi';
import { API_PATHS } from '@/common/api/paths';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import { SettingsPage } from '@/modules/settings/pages/SettingsPage';

/**
 * MSW **`server.use`** per test — **401**, **empty list**, **4xx errors** — with **`waitFor`** / **`findBy*`**
 * for async UI (`docs/PROJECT_PLAN.md` §14.4.1). Uses real **`httpClient`** (no **`fetch`** stub).
 */
function ConversationListProbe() {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'empty' }
    | { kind: 'count'; n: number }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' });

  useEffect(() => {
    listConversations()
      .then((page) => {
        if (page.items.length === 0) {
          setState({ kind: 'empty' });
        } else {
          setState({ kind: 'count', n: page.items.length });
        }
      })
      .catch((err: unknown) => {
        setState({ kind: 'error', message: parseApiError(err).message });
      });
  }, []);

  if (state.kind === 'loading') {
    return <p role="status">loading conversations</p>;
  }
  if (state.kind === 'empty') {
    return <p role="status">no conversations</p>;
  }
  if (state.kind === 'count') {
    return <p role="status">{state.n} conversations</p>;
  }
  return <p role="alert">{state.message}</p>;
}

describe('MSW integration (server.use)', () => {
  beforeEach(() => {
    cleanup();
  });

  it('PATCH profile: shows API error message on 400 ErrorResponse', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(`*/v1${API_PATHS.users.me}`, () =>
        HttpResponse.json(
          { code: 'INVALID_REQUEST', message: 'Profile update rejected' },
          { status: 400 },
        ),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      {
        route: '/settings',
        preloadedState: {
          auth: { user: { ...defaultMockUser }, accessToken: 'test-token' },
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /display name/i })).toHaveValue(
        'Test User',
      );
    });

    const display = screen.getByRole('textbox', { name: /display name/i });
    await user.clear(display);
    await user.type(display, 'New Name');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText(/profile update rejected/i),
    ).toBeInTheDocument();
  });

  it('PATCH profile: shows message on 401 ErrorResponse', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(`*/v1${API_PATHS.users.me}`, () =>
        HttpResponse.json(
          { code: 'UNAUTHORIZED', message: 'Session invalid' },
          { status: 401 },
        ),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      {
        route: '/settings',
        preloadedState: {
          auth: { user: { ...defaultMockUser }, accessToken: 'test-token' },
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /display name/i })).toHaveValue(
        'Test User',
      );
    });

    const display = screen.getByRole('textbox', { name: /display name/i });
    await user.clear(display);
    await user.type(display, 'X');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText(/session invalid/i),
    ).toBeInTheDocument();
  });

  it(`GET ${API_PATHS.conversations.list}: empty items shows empty state`, async () => {
    server.use(
      http.get(`*/v1${API_PATHS.conversations.list}`, () =>
        HttpResponse.json({ items: [], hasMore: false }),
      ),
    );

    renderWithProviders(<ConversationListProbe />, {
      preloadedState: {
        auth: { user: { ...defaultMockUser }, accessToken: 't' },
      },
    });

    expect(await screen.findByText(/no conversations/i)).toBeInTheDocument();
  });

  it(`GET ${API_PATHS.conversations.list}: 401 surfaces parsed error in UI`, async () => {
    server.use(
      http.get(`*/v1${API_PATHS.conversations.list}`, () =>
        HttpResponse.json(
          { code: 'UNAUTHORIZED', message: 'Not allowed' },
          { status: 401 },
        ),
      ),
    );

    renderWithProviders(<ConversationListProbe />, {
      preloadedState: {
        auth: { user: { ...defaultMockUser }, accessToken: 't' },
      },
    });

    expect(await screen.findByText(/not allowed/i)).toBeInTheDocument();
  });
});
