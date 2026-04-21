import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '@/common/test-utils';
import { ROUTES } from '@/routes/paths';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('renders the product title as the primary heading', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<LandingPage />} />
      </Routes>,
      { route: '/' },
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /ekko/i }),
    ).toBeInTheDocument();
  });

  it('renders a primary Continue as guest control linking to the guest route', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<LandingPage />} />
      </Routes>,
      { route: '/' },
    );

    const cta = screen.getByRole('link', { name: /^continue as guest$/i });
    expect(cta).toHaveAttribute('href', ROUTES.guest);
  });

  it('links to sign-in and register as secondary actions', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<LandingPage />} />
      </Routes>,
      { route: '/' },
    );

    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute(
      'href',
      ROUTES.login,
    );
    expect(screen.getByRole('link', { name: /^register$/i })).toHaveAttribute(
      'href',
      ROUTES.register,
    );
  });
});
