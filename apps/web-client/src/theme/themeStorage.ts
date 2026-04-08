export type ThemePreference = 'light' | 'dark';

const STORAGE_KEY = 'messaging-theme';

export function readStoredTheme(): ThemePreference | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : null;
}

export function writeStoredTheme(theme: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function resolveInitialTheme(): ThemePreference {
  const stored = readStoredTheme();
  if (stored) {
    return stored;
  }
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyThemeClass(theme: ThemePreference): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
