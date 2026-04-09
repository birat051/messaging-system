import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { ThemeToggle } from './ThemeToggle';

const STORAGE_KEY = 'messaging-theme';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.classList.remove('dark');
  });

  it('renders a button that reflects the current theme and toggles on click', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, 'light');

    renderWithProviders(<ThemeToggle />);

    const btn = screen.getByRole('button', { name: /switch to dark theme/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Light')).toBeInTheDocument();

    await user.click(btn);

    expect(
      screen.getByRole('button', { name: /switch to light theme/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });
});
