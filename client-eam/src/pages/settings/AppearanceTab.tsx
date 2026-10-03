import { Palette } from 'lucide-react';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { useTheme } from '../../contexts/ThemeContext';

export function AppearanceTab() {
  const { currentMeta } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Tema Tampilan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pilih tema visual ERP. Perubahan langsung berlaku tanpa reload.
          Preferensi disimpan di browser ini.
        </p>
      </div>

      <ThemeSwitcher variant="cards" />

      <div className="rounded border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Palette size={13} />
          <span>Tema aktif: <strong>{currentMeta.label}</strong></span>
        </div>
        <p>{currentMeta.description}</p>
      </div>
    </div>
  );
}
