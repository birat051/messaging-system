import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/common/test-utils';
import { ROUTES } from '@/routes/paths';
import { RegisteredOnlyRoute } from './RegisteredOnlyRoute';

function SettingsStub() {
  return <div>Settings content</div>;
}

describe('RegisteredOnlyRoute', () => {
  it('redirects guest users away from settings to home', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route element={<RegisteredOnlyRoute />}>
          <Route path="/settings" element={<SettingsStub />} />
        </Route>
      </Routes>,
      {
        route: '/settings',
        preloadedState: {
          auth: {
            user: {
              id: 'guest-1',
              email: null,
              username: 'g',
              displayName: null,
              emailVerified: false,
              profilePicture: null,
              status: null,
              guest: true,
            },
            accessToken: 'tok',
            accessTokenExpiresAt: null,
          },
        },
      },
    );

    expect(screen.getByText(/^home$/i)).toBeInTheDocument();
    expect(screen.queryByText(/settings content/i)).not.toBeInTheDocument();
  });

  it('renders settings for registered users', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route element={<RegisteredOnlyRoute />}>
          <Route path={ROUTES.settings} element={<SettingsStub />} />
        </Route>
      </Routes>,
      {
        route: ROUTES.settings,
        preloadedState: {
          auth: {
            user: {
              id: 'u1',
              email: 'a@b.com',
              username: 'u',
              displayName: 'U',
              emailVerified: true,
              profilePicture: null,
              status: null,
              guest: false,
            },
            accessToken: 'tok',
            accessTokenExpiresAt: null,
          },
        },
      },
    );

    expect(screen.getByText(/settings content/i)).toBeInTheDocument();
  });
});
