import { Palette } from 'lucide-react';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { useTheme } from '../../contexts/ThemeContext';

export function AppearanceTab() {
  const { theme, currentMeta, resolvedTheme } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Tema Tampilan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pilih Terang, Gelap, atau Sistem. Perubahan langsung berlaku tanpa memuat ulang halaman.
          Preferensi disimpan di browser ini.
        </p>
      </div>

      <ThemeSwitcher variant="cards" />

      <div className="space-y-1 rounded-lg border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Palette size={14} aria-hidden />
          <span>
            Tema aktif: <strong>{currentMeta.label}</strong>
          </span>
        </div>
        <p>
          {currentMeta.description}
          {theme === 'system' && ` — saat ini ${resolvedTheme === 'dark' ? 'gelap' : 'terang'}.`}
        </p>
      </div>
    </div>
  );
}
