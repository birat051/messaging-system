import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import { ThemeToggle } from './ThemeToggle';

const STORAGE_KEY = 'messaging-theme';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.classList.remove('dark');
  });

  it('renders a switch that reflects the current theme and toggles on click', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, 'light');

    renderWithProviders(<ThemeToggle />);

    const toggle = screen.getByRole('switch', { name: /switch to dark theme/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass('touch-manipulation', 'rounded-full');

    await user.click(toggle);

    expect(
      screen.getByRole('switch', { name: /switch to light theme/i }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });
});
