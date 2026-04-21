import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE } from '@/common/components/AuthLegalConsentCheckbox';
import { renderWithProviders } from '@/common/test-utils';
import { ROUTES } from '@/routes/paths';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('renders footer links to privacy policy and terms', () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/login' },
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

  it('requires legal consent before sign-in', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/login' },
    );

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'a@b.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret12345');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText(AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE)).toBeInTheDocument();
  });
});
