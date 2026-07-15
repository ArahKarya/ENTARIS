import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';

export type ThemeId = 'light' | 'dark' | 'system' | 'bloomberg-dark' | 'bloomberg-light';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  isDark: boolean;
  isBloomberg?: boolean;
}

export const THEME_PACKS: ThemeMeta[] = [
  { id: 'light',            label: 'Default Light',      description: 'Tampilan terang standar',          isDark: false },
  { id: 'dark',             label: 'Default Dark',       description: 'Tampilan gelap standar',           isDark: true  },
  { id: 'system',           label: 'Ikuti Sistem',       description: 'Otomatis sesuai OS',               isDark: false },
  { id: 'bloomberg-dark',   label: 'Bloomberg Dark',     description: 'Terminal amber-on-black',          isDark: true,  isBloomberg: true },
  { id: 'bloomberg-light',  label: 'Bloomberg Light',    description: 'Finance navy-on-cream',            isDark: false, isBloomberg: true },
];

interface ThemeContextType {
  theme: ThemeId;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeId) => void;
  themePacks: ThemeMeta[];
  currentMeta: ThemeMeta;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const BLOOMBERG_THEMES: ThemeId[] = ['bloomberg-dark', 'bloomberg-light'];
const ALL_THEME_CLASSES = ['light', 'dark', 'bloomberg-dark', 'bloomberg-light'];

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme: ThemeId): void {
  const root = document.documentElement;
  // Remove all theme classes first
  ALL_THEME_CLASSES.forEach(c => root.classList.remove(c));

  if (theme === 'system') {
    root.classList.add(getSystemDark() ? 'dark' : 'light');
  } else {
    root.classList.add(theme);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    return (localStorage.getItem('theme') as ThemeId) || 'light';
  });

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (theme === 'system') return getSystemDark() ? 'dark' : 'light';
    if (theme === 'bloomberg-dark') return 'dark';
    if (theme === 'bloomberg-light') return 'light';
    return theme as 'light' | 'dark';
  }, [theme]);

  const currentMeta = useMemo(
    () => THEME_PACKS.find(t => t.id === theme) ?? THEME_PACKS[0],
    [theme]
  );

  const setTheme = (next: ThemeId) => {
    localStorage.setItem('theme', next);
    setThemeState(next);
    applyTheme(next);
  };

  // Apply on mount + when theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system preference changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, themePacks: THEME_PACKS, currentMeta }),
    [theme, resolvedTheme, currentMeta] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// Convenience: check if current theme is a Bloomberg variant
export function useIsBloomberg(): boolean {
  const { theme } = useTheme();
  return BLOOMBERG_THEMES.includes(theme);
}
