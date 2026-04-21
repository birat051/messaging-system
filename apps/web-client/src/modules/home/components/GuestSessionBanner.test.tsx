import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { GuestSessionBanner } from './GuestSessionBanner';
import { renderWithProviders } from '@/common/test-utils';
import { registerPathFromGuest } from '@/routes/paths';

const guestUser = {
  id: 'guest-1',
  email: null,
  username: 'sandbox_user',
  displayName: null,
  emailVerified: false,
  profilePicture: null,
  status: null,
  guest: true as const,
};

describe('GuestSessionBanner', () => {
  it('renders session copy, countdown when expiresAt is set, and Create account link', () => {
    renderWithProviders(<GuestSessionBanner />, {
      preloadedState: {
        auth: {
          user: guestUser,
          accessToken: 'tok',
          accessTokenExpiresAt: '2030-01-01T12:00:00.000Z',
        },
      },
    });

    const region = screen.getByRole('region', { name: /guest session/i });
    expect(region).toHaveTextContent(/temporary guest session/i);
    expect(region).toHaveTextContent(/Session ends in/);
    const create = screen.getByRole('link', { name: /^create account$/i });
    expect(create).toHaveAttribute('href', registerPathFromGuest());
  });

  it('renders without time line when expiresAt is absent', () => {
    renderWithProviders(<GuestSessionBanner />, {
      preloadedState: {
        auth: {
          user: guestUser,
          accessToken: 'tok',
          accessTokenExpiresAt: null,
        },
      },
    });

    expect(
      screen.getByText(/you're using a temporary guest session/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/session ends in/i)).not.toBeInTheDocument();
  });

  it('renders nothing for registered users', () => {
    renderWithProviders(<GuestSessionBanner />, {
      preloadedState: {
        auth: {
          user: {
            id: 'u1',
            email: 'a@b.com',
            username: 'reg',
            displayName: 'Reg',
            emailVerified: true,
            profilePicture: null,
            status: null,
            guest: false,
          },
          accessToken: 'tok',
          accessTokenExpiresAt: null,
        },
      },
    });

    expect(
      screen.queryByRole('region', { name: /guest session/i }),
    ).not.toBeInTheDocument();
  });
});
