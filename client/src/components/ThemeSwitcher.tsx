import { useTheme, THEME_PACKS, type ThemeId } from '../contexts/ThemeContext';

interface ThemeSwitcherProps {
  /** 'select' = dropdown sederhana, 'cards' = grid kartu visual (untuk halaman Pengaturan) */
  variant?: 'select' | 'cards';
  className?: string;
}

const PREVIEW_COLORS: Record<ThemeId, { bg: string; sidebar: string; accent: string; text: string }> = {
  'light':           { bg: '#F9FAFB', sidebar: '#FFFFFF', accent: '#4A6FA5', text: '#1F2937' },
  'dark':            { bg: '#1A1D2E', sidebar: '#16192A', accent: '#6B8ACA', text: '#E2E8F0' },
  'system':          { bg: '#E5E7EB', sidebar: '#D1D5DB', accent: '#6B7280', text: '#374151' },
  'bloomberg-dark':  { bg: '#000000', sidebar: '#0A0A0A', accent: '#FF9900', text: '#E8A020' },
  'bloomberg-light': { bg: '#F5F4F0', sidebar: '#FFFFFF', accent: '#003366', text: '#1A1A3E' },
};

function MiniPreview({ themeId }: { themeId: ThemeId }) {
  const c = PREVIEW_COLORS[themeId];
  const isMono = themeId.startsWith('bloomberg');
  return (
    <div
      style={{ background: c.bg, borderRadius: 4, overflow: 'hidden', width: 80, height: 52, border: `1.5px solid ${c.accent}`, flexShrink: 0 }}
      aria-hidden
    >
      {/* mini sidebar */}
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ width: 18, background: c.sidebar, borderRight: `1px solid ${c.accent}` }} />
        <div style={{ flex: 1, padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* topbar */}
          <div style={{ height: 5, background: c.accent, borderRadius: 1 }} />
          {/* cards */}
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ flex: 1, background: c.sidebar, border: `0.5px solid ${c.accent}`, borderRadius: 1 }} />
            ))}
          </div>
          {/* table rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 0.7, 0.5].map((_, i) => (
              <div key={i} style={{ height: 2.5, background: isMono ? `${c.accent}40` : `${c.text}20`, borderRadius: 0.5 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemeSwitcher({ variant = 'cards', className = '' }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();

  if (variant === 'select') {
    return (
      <select
        value={theme}
        onChange={e => setTheme(e.target.value as ThemeId)}
        className={`border border-border rounded bg-card text-foreground px-3 py-1.5 text-sm cursor-pointer ${className}`}
      >
        {THEME_PACKS.map(t => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
    );
  }

  // Cards variant (untuk halaman Pengaturan)
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${className}`}>
      {THEME_PACKS.map(t => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={[
              'flex items-center gap-3 rounded border p-3 text-left transition-all',
              active
                ? 'border-primary bg-primary/8 ring-2 ring-primary/40'
                : 'border-border bg-card hover:border-primary/50 hover:bg-accent',
            ].join(' ')}
            aria-pressed={active}
          >
            <MiniPreview themeId={t.id} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-foreground">{t.label}</span>
                {t.isBloomberg && (
                  <span className="rounded bg-primary/15 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-primary">NEW</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
              {active && (
                <p className="mt-1 text-[10px] font-semibold text-primary">● Aktif</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
