import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { defaultMockUser } from '../mocks/handlers';
import { renderWithProviders } from '../test-utils';
import { ROUTES } from '../routes/paths';
import { HomePage } from './HomePage';

vi.mock('../hooks/usePresenceConnection', () => ({
  usePresenceConnection: () => ({ kind: 'idle' as const }),
}));

describe('HomePage', () => {
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
  });
});
