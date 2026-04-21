import { useTheme } from '../theme/useTheme';
import { MoonIcon } from './MoonIcon';
import { SunIcon } from './SunIcon';

/**
 * Theme control: **slider-style** track with **sun** (light) and **moon** (dark) icons; thumb moves with selection.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="border-border bg-muted/45 focus-visible:ring-ring dark:bg-muted/25 relative z-0 inline-flex h-9 w-14 shrink-0 touch-manipulation cursor-pointer items-center rounded-full border p-1 shadow-inner transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none dark:focus-visible:ring-offset-background"
      onClick={toggleTheme}
    >
      <span
        className="pointer-events-none absolute inset-y-1 left-1 right-1 z-0 flex items-center justify-between"
        aria-hidden
      >
        <SunIcon className="h-3.5 w-3.5 text-amber-500 opacity-90" />
        <MoonIcon className="h-3.5 w-3.5 text-sky-400 opacity-90 dark:text-sky-300" />
      </span>
      <span
        className={`pointer-events-none absolute top-1 z-10 h-7 w-7 rounded-full bg-surface shadow-md ring-1 ring-border transition-[left] duration-200 ease-out ${
          isDark ? 'left-[calc(100%-2rem)]' : 'left-1'
        }`}
        aria-hidden
      />
    </button>
  );
}
