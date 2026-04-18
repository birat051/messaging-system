import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '@/common/test-utils';
import { ROUTES } from '@/routes/paths';
import { RegisterPage } from './RegisterPage';

describe('RegisterPage', () => {
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
});
