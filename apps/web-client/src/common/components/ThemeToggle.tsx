import { useTheme } from '../theme/useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="focus-visible:ring-ring border-border bg-surface text-foreground shadow-card hover:bg-background focus-visible:ring-offset-background dark:focus-visible:ring-offset-background inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border px-4 py-2 text-sm transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <span className="text-muted" aria-hidden>
        {isDark ? '☾' : '☀'}
      </span>
      <span>{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
}
