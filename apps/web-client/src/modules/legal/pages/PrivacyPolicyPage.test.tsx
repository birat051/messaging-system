import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LEGAL_CONTACT_EMAIL } from '@/common/constants/legalContact';
import { PrivacyPolicyPage } from './PrivacyPolicyPage';
import { ROUTES } from '@/routes/paths';

describe('PrivacyPolicyPage', () => {
  it('renders the privacy policy heading and MVP placeholder overview', () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.privacy]}>
        <Routes>
          <Route path={ROUTES.privacy} element={<PrivacyPolicyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /privacy policy/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/MVP placeholder/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByText(/Birat Bhattacharjee/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: new RegExp(LEGAL_CONTACT_EMAIL, 'i') }),
    ).toHaveAttribute('href', `mailto:${LEGAL_CONTACT_EMAIL}`);
  });

  it('links back to home', () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.privacy]}>
        <Routes>
          <Route path={ROUTES.privacy} element={<PrivacyPolicyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const back = screen.getByRole('link', { name: /back to home/i });
    expect(back).toHaveAttribute('href', ROUTES.home);
  });

  it('exposes a main landmark for skip targets', () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.privacy]}>
        <Routes>
          <Route path={ROUTES.privacy} element={<PrivacyPolicyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('main')).toHaveAttribute('id', 'privacy-policy-main');
  });
});
