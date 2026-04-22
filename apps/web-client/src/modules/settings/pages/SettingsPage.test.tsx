import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { API_PATHS } from '@/common/api/paths';
import { writeRefreshToken } from '@/modules/auth/utils/authStorage';
import { PROFILE_AVATAR_CLIENT_TYPE_ERROR } from '@/common/api/usersApi';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import { ROUTES } from '@/routes/paths';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    cleanup();
  });

  it('sign out posts refresh token, clears storage, and redirects to login', async () => {
    const ue = userEvent.setup();
    writeRefreshToken('fixture-refresh-token');

    let logoutBody: unknown;
    server.use(
      http.post(`*/v1${API_PATHS.auth.logout}`, async ({ request }) => {
        logoutBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/login" element={<div data-testid="login-route">Sign in</div>} />
      </Routes>,
      {
        route: '/settings',
        preloadedState: {
          auth: { user: { ...defaultMockUser }, accessToken: 'test-token' },
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
    });

    await ue.click(screen.getByRole('button', { name: /^sign out$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('login-route')).toBeInTheDocument();
    });

    expect(logoutBody).toEqual({ refreshToken: 'fixture-refresh-token' });
    expect(localStorage.getItem('messaging-refresh-token')).toBeNull();
    localStorage.clear();
  });

  it('shows loading when there is no authenticated user', () => {
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      {
        route: '/settings',
        preloadedState: { auth: { user: null, accessToken: null } },
      },
    );

    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
  });

  it('links to privacy policy and terms with the same routes as auth footers', async () => {
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
      expect(
        screen.getByRole('textbox', { name: /display name/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('region', { name: /legal/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      ROUTES.privacy,
    );
    expect(screen.getByRole('link', { name: /terms and conditions/i })).toHaveAttribute(
      'href',
      ROUTES.terms,
    );
  });

  it('shows validation when submit is pressed with no changes', async () => {
    const user = userEvent.setup();

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
      expect(
        screen.getByRole('textbox', { name: /display name/i }),
      ).toHaveValue('Test User');
    });

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText(
        /change your display name, status, or choose a new profile image/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows profile image error when file is not a supported image type', async () => {
    const ue = userEvent.setup();

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
      expect(
        screen.getByRole('textbox', { name: /display name/i }),
      ).toBeInTheDocument();
    });

    /** `image/*` matches SVG, but avatar presign only allows JPEG/PNG/WebP/GIF (see **`isAllowedProfileAvatarFile`**). */
    const svg = new File([new Uint8Array([1, 2])], 'icon.svg', {
      type: 'image/svg+xml',
    });
    await ue.upload(screen.getByLabelText(/profile image/i), svg);
    await ue.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const err = document.getElementById('settings-profile-image-error');
      expect(err?.textContent).toBe(PROFILE_AVATAR_CLIENT_TYPE_ERROR);
    });
  });

  it('shows profile image error when presign returns an error', async () => {
    server.use(
      http.post(`*/v1${API_PATHS.users.meAvatarPresign}`, () =>
        HttpResponse.json(
          { code: 'MEDIA_NOT_CONFIGURED', message: 'Avatar presign unavailable' },
          { status: 503 },
        ),
      ),
    );

    const ue = userEvent.setup();

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
      expect(
        screen.getByRole('textbox', { name: /display name/i }),
      ).toBeInTheDocument();
    });

    const file = new File([new Uint8Array([1, 2, 3])], 'face.png', {
      type: 'image/png',
    });
    await ue.upload(screen.getByLabelText(/profile image/i), file);
    await ue.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const err = document.getElementById('settings-profile-image-error');
      expect(err?.textContent).toContain('Avatar presign unavailable');
    });
  });

  it('shows profile image error when PUT to pre-signed URL fails', async () => {
    server.use(
      http.put('https://r2.mock/presigned-avatar', () =>
        HttpResponse.text('forbidden', { status: 403 }),
      ),
    );

    const ue = userEvent.setup();

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
      expect(
        screen.getByRole('textbox', { name: /display name/i }),
      ).toBeInTheDocument();
    });

    const file = new File([new Uint8Array([1, 2, 3])], 'face.png', {
      type: 'image/png',
    });
    await ue.upload(screen.getByLabelText(/profile image/i), file);
    await ue.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const err = document.getElementById('settings-profile-image-error');
      expect(err?.textContent).toMatch(/upload failed|403/i);
    });
  });

  it('submits new profile image via avatar presign + JSON PATCH and shows success', async () => {
    const ue = userEvent.setup();

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
      expect(
        screen.getByRole('textbox', { name: /display name/i }),
      ).toBeInTheDocument();
    });

    const file = new File([new Uint8Array([1, 2, 3])], 'face.png', {
      type: 'image/png',
    });
    await ue.upload(screen.getByLabelText(/profile image/i), file);
    await ue.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
  });

  it('submits profile updates via PATCH /users/me and shows success', async () => {
    const user = userEvent.setup();

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

    const display = screen.getByRole('textbox', { name: /display name/i });
    await user.clear(display);
    await user.type(display, 'Updated Name');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();

    expect(display).toHaveValue('Updated Name');
  });
});
