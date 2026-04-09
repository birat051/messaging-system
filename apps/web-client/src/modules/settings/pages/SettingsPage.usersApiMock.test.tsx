import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { defaultMockUser } from '@/common/mocks/handlers';
import { renderWithProviders } from '@/common/test-utils';
import type { components } from '@/generated/api-types';
import { SettingsPage } from './SettingsPage';

type User = components['schemas']['User'];

vi.mock('@/common/api/usersApi', () => ({
  updateCurrentUserProfile: vi.fn(),
}));

import * as usersApi from '@/common/api/usersApi';

const mockedUsersApi = vi.mocked(usersApi, true);

/**
 * Unit-style test: mock **one API module** (`usersApi`), assert **call shape** + **UI outcome**
 * (no MSW, no `fetch`). Compare with **`SettingsPage.test.tsx`** (MSW integration).
 */
describe('SettingsPage (vi.mock usersApi)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('calls updateCurrentUserProfile and shows success from resolved user', async () => {
    const user = userEvent.setup();
    const updated: User = {
      ...defaultMockUser,
      displayName: 'Updated Name',
    };
    mockedUsersApi.updateCurrentUserProfile.mockResolvedValue(updated);

    const { store } = renderWithProviders(
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
    await user.type(display, 'Updated Name');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mockedUsersApi.updateCurrentUserProfile).toHaveBeenCalledTimes(1);
    expect(mockedUsersApi.updateCurrentUserProfile).toHaveBeenCalledWith(
      expect.any(FormData),
    );

    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
    expect(store.getState().auth.user?.displayName).toBe('Updated Name');
  });
});
