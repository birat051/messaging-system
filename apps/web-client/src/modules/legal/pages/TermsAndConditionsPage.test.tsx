import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LEGAL_CONTACT_EMAIL } from '@/common/constants/legalContact';
import { TermsAndConditionsPage } from './TermsAndConditionsPage';
import { ROUTES } from '@/routes/paths';

describe('TermsAndConditionsPage', () => {
  it('renders the terms heading and MVP placeholder overview', () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.terms]}>
        <Routes>
          <Route path={ROUTES.terms} element={<TermsAndConditionsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /terms and conditions/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/MVP placeholder/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Birat Bhattacharjee/i).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('link', { name: new RegExp(LEGAL_CONTACT_EMAIL, 'i') }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('links back to home', () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.terms]}>
        <Routes>
          <Route path={ROUTES.terms} element={<TermsAndConditionsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const back = screen.getByRole('link', { name: /back to home/i });
    expect(back).toHaveAttribute('href', ROUTES.home);
  });

  it('exposes a main landmark for skip targets', () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.terms]}>
        <Routes>
          <Route path={ROUTES.terms} element={<TermsAndConditionsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('main')).toHaveAttribute('id', 'terms-and-conditions-main');
  });
});
