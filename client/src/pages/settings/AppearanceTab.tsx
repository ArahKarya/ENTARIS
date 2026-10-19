import { Palette } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { useTheme } from '../../contexts/ThemeContext';
import { MotionSwitcher } from '../../components/MotionSwitcher';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { useMotion } from '../../contexts/motion-context';
import { SettingsCard } from '../../components/settings/SettingsCard';

export function AppearanceTab() {
  const { t } = useTranslation(['settings', 'common']);
  const { theme, resolvedTheme } = useTheme();
  const { followsDevice, systemReduced } = useMotion();

  return (
    <div className="space-y-4">
      <SettingsCard
        title={t('appearance.language.title')}
        description={t('appearance.language.description')}
      >
        <LanguageSwitcher />
      </SettingsCard>
      <SettingsCard
        title={t('appearance.theme.title')}
        description={t('appearance.theme.description')}
        contentClassName="space-y-4"
      >
        <ThemeSwitcher variant="cards" />
        <div className="space-y-1 rounded-lg border border-border bg-muted px-4 py-3 text-xs text-muted-foreground" aria-live="polite">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Palette className="size-3.5" aria-hidden />
            <span>
              <Trans
                t={t}
                i18nKey="appearance.theme.current"
                values={{ label: t(`common:theme.${theme}.label`) }}
                components={{ strong: <strong /> }}
              />
            </span>
          </p>
          <p>
            {t(`common:theme.${theme}.description`)}
            {theme === 'system' &&
              t('appearance.theme.systemNow', {
                mode: resolvedTheme === 'dark' ? t('appearance.theme.systemDark') : t('appearance.theme.systemLight'),
              })}
          </p>
        </div>
      </SettingsCard>
      <SettingsCard
        title={t('appearance.motion.title')}
        description={t('appearance.motion.description')}
        contentClassName="space-y-3"
      >
        <MotionSwitcher />
        {followsDevice && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {systemReduced ? t('appearance.motion.followsReduced') : t('appearance.motion.followsDefault')}
          </p>
        )}
      </SettingsCard>
    </div>
  );
}
