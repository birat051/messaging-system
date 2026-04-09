import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { defaultMockUser } from '@/common/mocks/handlers';
import { renderWithProviders } from '@/common/test-utils';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows loading when there is no authenticated user', () => {
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: '/settings', preloadedState: { auth: { user: null, accessToken: null } } },
    );

    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
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
      expect(screen.getByRole('textbox', { name: /display name/i })).toHaveValue(
        'Test User',
      );
    });

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText(
        /change your display name, status, or choose a new profile image/i,
      ),
    ).toBeInTheDocument();
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
