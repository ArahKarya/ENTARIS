import { Palette } from 'lucide-react';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { useTheme } from '../../contexts/ThemeContext';
import { SettingsCard } from '../../components/settings/SettingsCard';

export function AppearanceTab() {
  const { theme, currentMeta, resolvedTheme } = useTheme();

  return (
    <SettingsCard
      title="Tema Tampilan"
      description="Pilih Terang, Gelap, atau Sistem. Perubahan langsung berlaku dan disimpan di browser ini."
      contentClassName="space-y-4"
    >
      <ThemeSwitcher variant="cards" />
      <div className="space-y-1 rounded-lg border border-border bg-muted px-4 py-3 text-xs text-muted-foreground" aria-live="polite">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Palette className="size-3.5" aria-hidden />
          <span>Tema aktif: <strong>{currentMeta.label}</strong></span>
        </p>
        <p>
          {currentMeta.description}
          {theme === 'system' && `, saat ini ${resolvedTheme === 'dark' ? 'gelap' : 'terang'}.`}
        </p>
      </div>
    </SettingsCard>
  );
}
