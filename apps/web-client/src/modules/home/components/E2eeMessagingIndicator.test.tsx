import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
import { E2eeMessagingIndicator } from './E2eeMessagingIndicator';

describe('E2eeMessagingIndicator', () => {
  it('renders a non-blocking status that states messages are end-to-end encrypted', () => {
    renderWithProviders(<E2eeMessagingIndicator />);

    const region = screen.getByTestId('e2ee-messaging-indicator');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveTextContent(/end-to-end encrypted/i);
  });

  it('exposes supplemental detail via title for hover and assistive context', () => {
    renderWithProviders(<E2eeMessagingIndicator />);

    const region = screen.getByTestId('e2ee-messaging-indicator');
    expect(region).toHaveAttribute('title');
    const title = region.getAttribute('title') ?? '';
    expect(title.length).toBeGreaterThan(10);
    expect(title.toLowerCase()).toMatch(/encrypt/);
  });

  it('uses a decorative icon only (no duplicate announcement)', () => {
    renderWithProviders(<E2eeMessagingIndicator />);

    const icon = screen.getByTestId('e2ee-messaging-indicator').querySelector('svg');
    expect(icon).toBeTruthy();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
