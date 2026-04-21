import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE } from '@/common/components/AuthLegalConsentCheckbox';
import { renderWithProviders } from '@/common/test-utils';
import { registerPathFromGuest, ROUTES } from '@/routes/paths';
import { RegisterPage } from './RegisterPage';

describe('RegisterPage', () => {
  it('renders footer links to privacy policy and terms', () => {
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/register' },
    );

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      ROUTES.privacy,
    );
    expect(
      within(footer).getByRole('link', { name: /terms and conditions/i }),
    ).toHaveAttribute('href', ROUTES.terms);
  });

  it('keeps full registration on the form and offers guest entry only as a separate link', () => {
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/register' },
    );

    expect(screen.getByRole('textbox', { name: /^email$/i })).toBeInTheDocument();
    const guestEntry = screen.getByRole('link', { name: /continue as guest/i });
    expect(guestEntry).toHaveAttribute('href', ROUTES.guest);
  });

  it('requires email: client validation shows when email is empty', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/register' },
    );

    const email = screen.getByRole('textbox', { name: /^email$/i });
    expect(email).toHaveAttribute('required');

    await user.type(screen.getByRole('textbox', { name: /^display name$/i }), 'Test User');
    await user.type(screen.getByRole('textbox', { name: /^username$/i }), 'valid_user');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');

    const form = screen.getByRole('button', { name: /^register$/i }).closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
  });

  it('requires legal consent when other fields validate', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/register' },
    );

    await user.type(screen.getByRole('textbox', { name: /^email$/i }), 'new@example.com');
    await user.type(screen.getByRole('textbox', { name: /^display name$/i }), 'Test User');
    await user.type(screen.getByRole('textbox', { name: /^username$/i }), 'valid_user');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');

    const form = screen.getByRole('button', { name: /^register$/i }).closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    expect(await screen.findByText(AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE)).toBeInTheDocument();
  });

  it('does not redirect guests with a session — they can complete registration', () => {
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<div data-testid="home">Home</div>} />
      </Routes>,
      {
        route: '/register',
        preloadedState: {
          auth: {
            user: {
              id: 'guest-1',
              email: null,
              username: 'sandbox_x',
              displayName: null,
              emailVerified: false,
              profilePicture: null,
              status: null,
              guest: true,
            },
            accessToken: 'guest-access',
            accessTokenExpiresAt: null,
          },
        },
      },
    );

    expect(screen.getByRole('textbox', { name: /^email$/i })).toBeInTheDocument();
    expect(screen.queryByTestId('home')).not.toBeInTheDocument();
  });

  it('sets data-register-from-guest when opened with ?from=guest (stable guest intent)', () => {
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: registerPathFromGuest() },
    );

    expect(
      document.querySelector('[data-register-from-guest="true"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^email$/i })).toBeInTheDocument();
  });

  it('redirects registered users who already have a session', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<div data-testid="home">Home</div>} />
      </Routes>,
      {
        route: '/register',
        preloadedState: {
          auth: {
            user: {
              id: 'u-reg',
              email: 'a@b.com',
              username: 'reg',
              displayName: 'Reg',
              emailVerified: true,
              profilePicture: null,
              status: null,
              guest: false,
            },
            accessToken: 'reg-token',
            accessTokenExpiresAt: null,
          },
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByTestId('home')).toBeInTheDocument();
    });
  });
});
