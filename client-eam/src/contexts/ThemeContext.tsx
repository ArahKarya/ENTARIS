import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  DARK_QUERY,
  DEFAULT_THEME,
  STALE_THEME_CLASSES,
  THEME_PACKS,
  THEME_STORAGE_KEY,
  normalizeTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemeId,
  type ThemeMeta,
} from '@/lib/theme';

export type { ResolvedTheme, ThemeId, ThemeMeta };

function readStoredTheme(): ThemeId {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    const theme = normalizeTheme(raw);
    // Migrate legacy values (bloomberg-*, neo-clean, garbage) once.
    if (raw !== null && raw !== theme) window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    return theme;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeStoredTheme(theme: ThemeId): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage blocked (private mode): preference lasts for this session only */
  }
}

function getSystemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

function subscribeSystemDark(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.remove(...STALE_THEME_CLASSES, resolved === 'dark' ? 'light' : 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

interface ThemeContextType {
  /** Stored preference. */
  theme: ThemeId;
  /** What is actually rendered (system resolved against the OS). */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeId) => void;
  themePacks: readonly ThemeMeta[];
  currentMeta: ThemeMeta;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme);
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);
  const resolvedTheme = resolveTheme(theme, systemDark);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemeId) => {
    const normalized = normalizeTheme(next);
    writeStoredTheme(normalized);
    setThemeState(normalized);
  }, []);

  const currentMeta = useMemo(
    () => THEME_PACKS.find((t) => t.id === theme) ?? THEME_PACKS[2],
    [theme],
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, themePacks: THEME_PACKS, currentMeta }),
    [theme, resolvedTheme, setTheme, currentMeta],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
