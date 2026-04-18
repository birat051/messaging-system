import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { GuestSessionBanner } from '@/modules/home/components/GuestSessionBanner';
import { UserSearchPanel } from '@/modules/home/components/UserSearchPanel';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import {
  renderWithProviders,
  type PreloadedRootState,
} from '@/common/test-utils';
import { Routes, Route } from 'react-router-dom';
import { API_PATHS } from '@/common/api/paths';
import { GuestEntryPage } from '@/modules/auth/pages/GuestEntryPage';
import type { components } from '@/generated/api-types';

type GuestAuthResponse = components['schemas']['GuestAuthResponse'];

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
    accessToken: 'guest-token',
    accessTokenExpiresAt: '2030-06-01T00:00:00.000Z',
  },
};

describe('Guest sandbox integration (MSW + Redux)', () => {
  it('Redux: registered session has user.guest false', () => {
    const { store } = renderWithProviders(
      <div>auth probe</div>,
      {
        preloadedState: {
          auth: {
            user: { ...defaultMockUser },
            accessToken: 't',
            accessTokenExpiresAt: null,
          },
        },
      },
    );
    expect(store.getState().auth.user?.guest).toBe(false);
    expect(store.getState().auth.accessToken).toBe('t');
  });

  it('Redux: guest session has user.guest true and optional accessTokenExpiresAt', () => {
    const { store } = renderWithProviders(<div>auth probe</div>, {
      preloadedState: guestPanelPreload,
    });
    expect(store.getState().auth.user?.guest).toBe(true);
    expect(store.getState().auth.user?.username).toBe('sandbox');
    expect(store.getState().auth.accessTokenExpiresAt).toBe('2030-06-01T00:00:00.000Z');
  });

  it('happy path: username → guest session in Redux (POST /auth/guest)', async () => {
    const user = userEvent.setup();
    const body: GuestAuthResponse = {
      accessToken: 'g-at',
      refreshToken: 'g-rt',
      tokenType: 'Bearer',
      expiresIn: 1800,
      expiresAt: '2030-01-15T12:00:00.000Z',
      user: {
        id: 'new-guest-id',
        email: null,
        username: 'happy_guest',
        displayName: null,
        emailVerified: false,
        profilePicture: null,
        status: null,
        guest: true,
      },
    };

    server.use(
      http.post(`*/v1${API_PATHS.auth.guest}`, () =>
        HttpResponse.json(body),
      ),
    );

    const { store } = renderWithProviders(
      <Routes>
        <Route path="/guest" element={<GuestEntryPage />} />
        <Route path="/" element={<p>ok home</p>} />
      </Routes>,
      { route: '/guest' },
    );

    await user.type(screen.getByLabelText(/^username/i), 'happy_guest');
    await user.click(screen.getByRole('button', { name: /start guest session/i }));

    await waitFor(() => {
      expect(screen.getByText(/ok home/i)).toBeInTheDocument();
    });

    expect(store.getState().auth.accessToken).toBe('g-at');
    expect(store.getState().auth.user?.guest).toBe(true);
    expect(store.getState().auth.user?.username).toBe('happy_guest');
    expect(store.getState().auth.accessTokenExpiresAt).toBe('2030-01-15T12:00:00.000Z');
  });

  it('guest directory (MSW): search returns only guest-flagged users; UI labels them', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/v1/users/search', () =>
        HttpResponse.json([
          {
            userId: 'g1',
            username: 'guest_a',
            displayName: 'Guest A',
            profilePicture: null,
            conversationId: null,
            guest: true,
          },
          {
            userId: 'g2',
            username: 'guest_b',
            displayName: 'Guest B',
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

    await user.type(screen.getByRole('textbox', { name: /search guests/i }), 'gue');

    await waitFor(() => {
      expect(screen.getByText(/found 2 other guests/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText('(Guest)')).toHaveLength(2);
  });

  it('GuestSessionBanner: shows ~0s when access expiry is in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:05:00.000Z'));

    renderWithProviders(<GuestSessionBanner />, {
      preloadedState: {
        auth: {
          user: {
            id: 'g1',
            email: null,
            username: 'exp_test',
            displayName: null,
            emailVerified: false,
            profilePicture: null,
            status: null,
            guest: true,
          },
          accessToken: 'tok',
          accessTokenExpiresAt: '2026-06-01T12:04:30.000Z',
        },
      },
    });

    expect(screen.getByText(/session ends in ~0s/i)).toBeInTheDocument();

    vi.useRealTimers();
  });
});
