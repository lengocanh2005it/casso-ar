import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'casso-ledger:theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#1a201d',
};

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_QUERY).matches
    ? 'dark'
    : 'light';
}

function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system'
    ? stored
    : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute('content', THEME_COLORS[resolvedTheme]);
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
