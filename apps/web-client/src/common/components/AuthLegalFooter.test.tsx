import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthLegalFooter } from './AuthLegalFooter';
import { ROUTES } from '@/routes/paths';

describe('AuthLegalFooter', () => {
  it('renders a footer with same-tab links to privacy and terms', () => {
    render(
      <MemoryRouter>
        <AuthLegalFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    const privacy = screen.getByRole('link', { name: /privacy policy/i });
    const terms = screen.getByRole('link', { name: /terms and conditions/i });
    expect(privacy).toHaveAttribute('href', ROUTES.privacy);
    expect(terms).toHaveAttribute('href', ROUTES.terms);
  });
});
