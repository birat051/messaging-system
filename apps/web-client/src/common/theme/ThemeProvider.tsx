import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ThemeContext } from './context';
import {
  applyThemeClass,
  resolveInitialTheme,
  writeStoredTheme,
  type ThemePreference,
} from './themeStorage';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const initial = resolveInitialTheme();
    if (typeof document !== 'undefined') {
      applyThemeClass(initial);
    }
    return initial;
  });

  useEffect(() => {
    applyThemeClass(theme);
    writeStoredTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
