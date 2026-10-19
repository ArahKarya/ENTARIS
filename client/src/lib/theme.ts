/**
 * Theme ids and pure helpers. `normalizeTheme` maps any unknown stored value (old pack ids) to 'system'.
 * public/theme-init.js mirrors this logic so the right class is on <html> before first paint.
 */
export type ThemeId = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEME_STORAGE_KEY = 'theme';
export const DEFAULT_THEME: ThemeId = 'system';

export const THEME_PACKS: readonly ThemeMeta[] = [
  { id: 'light', label: 'Terang', description: 'Latar terang, cocok untuk ruangan terang' },
  { id: 'dark', label: 'Gelap', description: 'Latar gelap, nyaman untuk ruangan redup' },
  { id: 'system', label: 'Sistem', description: 'Mengikuti pengaturan perangkat' },
];

/** Classes that older builds put on <html>; removed on apply. */
export const STALE_THEME_CLASSES = ['bloomberg-dark', 'bloomberg-light', 'neo-clean'];
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function normalizeTheme(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export function resolveTheme(theme: ThemeId, systemDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}
