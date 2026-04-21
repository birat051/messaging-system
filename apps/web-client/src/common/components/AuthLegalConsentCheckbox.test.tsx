import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthLegalConsentCheckbox } from './AuthLegalConsentCheckbox';
import { ROUTES } from '@/routes/paths';

describe('AuthLegalConsentCheckbox', () => {
  it('renders links to privacy and terms', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <AuthLegalConsentCheckbox id="t-consent" checked={false} onChange={onChange} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('checkbox', { name: /i agree to the/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      ROUTES.privacy,
    );
    expect(screen.getByRole('link', { name: /terms and conditions/i })).toHaveAttribute(
      'href',
      ROUTES.terms,
    );
  });
});
