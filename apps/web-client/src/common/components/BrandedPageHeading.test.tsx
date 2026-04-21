import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
import { BrandedPageHeading } from './BrandedPageHeading';

describe('BrandedPageHeading', () => {
  it('renders an h1 and a decorative logo image', () => {
    renderWithProviders(<BrandedPageHeading>Sign in</BrandedPageHeading>);

    expect(
      screen.getByRole('heading', { level: 1, name: /^sign in$/i }),
    ).toBeInTheDocument();
    const logo = document.querySelector('img[aria-hidden="true"]');
    expect(logo).toBeTruthy();
    expect(logo).toHaveAttribute('alt', '');
  });
});
