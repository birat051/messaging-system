import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { API_PATHS } from '@/common/api/paths';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import type { components } from '@/generated/api-types';
import { GuestEntryPage } from './GuestEntryPage';

type GuestAuthResponse = components['schemas']['GuestAuthResponse'];

function guestAuthResponse(username: string): GuestAuthResponse {
  return {
    accessToken: 'guest-access-token',
    refreshToken: 'guest-refresh-token',
    tokenType: 'Bearer',
    expiresIn: 1800,
    expiresAt: '2026-12-31T23:59:59.000Z',
    user: {
      id: 'guest-user-test',
      email: null,
      username,
      displayName: null,
      emailVerified: false,
      profilePicture: null,
      status: null,
      guest: true,
    },
  };
}

describe('GuestEntryPage', () => {
  it('shows validation when username is empty', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/guest" element={<GuestEntryPage />} />
      </Routes>,
      { route: '/guest' },
    );

    await user.click(screen.getByRole('button', { name: /start guest session/i }));

    expect(
      await screen.findByText(/username is required/i),
    ).toBeInTheDocument();
  });

  it('shows validation when username is too short', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/guest" element={<GuestEntryPage />} />
      </Routes>,
      { route: '/guest' },
    );

    await user.type(screen.getByLabelText(/^username/i), 'ab');
    await user.click(screen.getByRole('button', { name: /start guest session/i }));

    expect(
      await screen.findByText(
        /username must be \d+–\d+ characters/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows validation for invalid username characters', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/guest" element={<GuestEntryPage />} />
      </Routes>,
      { route: '/guest' },
    );

    await user.type(screen.getByLabelText(/^username/i), 'no-dashes');
    await user.click(screen.getByRole('button', { name: /start guest session/i }));

    expect(
      await screen.findByText(/letters, digits, and underscores/i),
    ).toBeInTheDocument();
  });

  it('POST /auth/guest succeeds, hydrates auth slice, and navigates to home', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`*/v1${API_PATHS.auth.guest}`, async ({ request }) => {
        const body = (await request.json()) as { username: string };
        return HttpResponse.json(guestAuthResponse(body.username));
      }),
    );

    const { store } = renderWithProviders(
      <Routes>
        <Route path="/guest" element={<GuestEntryPage />} />
        <Route path="/" element={<p>Home screen</p>} />
      </Routes>,
      { route: '/guest' },
    );

    await user.type(screen.getByLabelText(/^username/i), 'valid_guest');
    await user.click(screen.getByRole('button', { name: /start guest session/i }));

    await waitFor(() => {
      expect(screen.getByText(/home screen/i)).toBeInTheDocument();
    });

    expect(store.getState().auth.accessToken).toBe('guest-access-token');
    expect(store.getState().auth.user?.guest).toBe(true);
    expect(store.getState().auth.user?.username).toBe('valid_guest');
  });

  it('includes optional displayName in POST /auth/guest body when provided', async () => {
    const user = userEvent.setup();
    let requestBody: unknown;

    server.use(
      http.post(`*/v1${API_PATHS.auth.guest}`, async ({ request }) => {
        requestBody = await request.json();
        const body = requestBody as { username: string };
        return HttpResponse.json(guestAuthResponse(body.username));
      }),
    );

    const { store } = renderWithProviders(
      <Routes>
        <Route path="/guest" element={<GuestEntryPage />} />
        <Route path="/" element={<p>Home screen</p>} />
      </Routes>,
      { route: '/guest' },
    );

    await user.type(screen.getByLabelText(/^username/i), 'valid_guest');
    await user.type(screen.getByLabelText(/^display name/i), 'Party Ghost');
    await user.click(screen.getByRole('button', { name: /start guest session/i }));

    await waitFor(() => {
      expect(screen.getByText(/home screen/i)).toBeInTheDocument();
    });

    expect(requestBody).toMatchObject({
      username: 'valid_guest',
      displayName: 'Party Ghost',
    });
    expect(store.getState().auth.accessToken).toBe('guest-access-token');
  });
});
