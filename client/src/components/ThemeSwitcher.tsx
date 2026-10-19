import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { THEME_PACKS, normalizeTheme, type ThemeId } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface ThemeSwitcherProps {
  /** 'select' = compact dropdown, 'cards' = visual cards (Settings page) */
  variant?: 'select' | 'cards';
  className?: string;
}

const THEME_ICONS: Record<ThemeId, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Static preview swatches that mirror the light/dark tokens in index.css. */
const PREVIEW: Record<'light' | 'dark', { bg: string; surface: string; border: string; primary: string; text: string }> = {
  light: { bg: '#F6F8FB', surface: '#FFFFFF', border: '#E2E7EF', primary: '#2F6FC4', text: '#142033' },
  dark: { bg: '#0D1524', surface: '#131D2F', border: '#24324A', primary: '#5B9BE8', text: '#E8EDF5' },
};

function MiniWindow({ scheme }: { scheme: 'light' | 'dark' }) {
  const c = PREVIEW[scheme];
  return (
    <div className="flex h-full" style={{ background: c.bg }}>
      <div style={{ width: 16, background: c.surface, borderRight: `1px solid ${c.border}` }} />
      <div className="flex flex-1 flex-col gap-[3px] p-1">
        <div style={{ height: 4, width: '60%', background: c.text, opacity: 0.8, borderRadius: 1 }} />
        <div className="flex flex-1 gap-[2px]">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 2 }} />
          ))}
        </div>
        <div style={{ height: 5, width: 22, background: c.primary, borderRadius: 1 }} />
      </div>
    </div>
  );
}

function MiniPreview({ themeId }: { themeId: ThemeId }) {
  return (
    <div
      className="h-[52px] w-[80px] shrink-0 overflow-hidden rounded-md border border-border-strong"
      aria-hidden
    >
      {themeId === 'system' ? (
        <div className="relative h-full">
          <MiniWindow scheme="light" />
          <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
            <MiniWindow scheme="dark" />
          </div>
        </div>
      ) : (
        <MiniWindow scheme={themeId} />
      )}
    </div>
  );
}

export function ThemeSwitcher({ variant = 'cards', className = '' }: ThemeSwitcherProps) {
  const { t } = useTranslation(['common', 'settings']);
  const { theme, setTheme } = useTheme();

  if (variant === 'select') {
    return (
      <select
        value={theme}
        onChange={(e) => setTheme(normalizeTheme(e.target.value))}
        aria-label={t('theme.groupLabel')}
        className={cn(
          'cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground',
          className,
        )}
      >
        {THEME_PACKS.map((pack) => (
          <option key={pack.id} value={pack.id}>
            {t(`theme.${pack.id}.label`)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div role="radiogroup" aria-label={t('theme.groupLabel')} className={cn('grid grid-cols-1 gap-3 sm:grid-cols-3', className)}>
      {THEME_PACKS.map((pack) => {
        const active = theme === pack.id;
        const Icon = THEME_ICONS[pack.id];
        return (
          <button
            key={pack.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(pack.id)}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active
                ? 'border-primary bg-primary-subtle'
                : 'border-border bg-card hover:border-border-strong hover:bg-accent',
            )}
          >
            <MiniPreview themeId={pack.id} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                <span className="truncate text-sm font-semibold text-foreground">{t(`theme.${pack.id}.label`)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{t(`theme.${pack.id}.description`)}</p>
              {active && <p className="mt-1 text-xs font-medium text-primary-subtle-foreground">{t('settings:appearance.active')}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
