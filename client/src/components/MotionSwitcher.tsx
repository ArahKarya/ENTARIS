import { useTranslation } from 'react-i18next';
import { useMotion } from '@/contexts/motion-context';
import { MOTION_LEVELS } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Four motion levels as radio cards (DESIGN.md "Gerak"). */
export function MotionSwitcher({ className = '' }: { className?: string }) {
  const { t } = useTranslation('settings');
  const { motion, setMotion } = useMotion();

  return (
    <div role="radiogroup" aria-label={t('appearance.motion.groupLabel')} className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {MOTION_LEVELS.map((level) => {
        const active = motion === level.id;
        return (
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMotion(level.id)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active
                ? 'border-primary bg-primary-subtle'
                : 'border-border bg-card hover:border-border-strong hover:bg-accent',
            )}
          >
            <span className="block text-sm font-semibold text-foreground">{t(`appearance.motion.levels.${level.id}.label`)}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t(`appearance.motion.levels.${level.id}.description`)}</span>
            {active && <span className="mt-1 block text-xs font-medium text-primary-subtle-foreground">{t('appearance.active')}</span>}
          </button>
        );
      })}
    </div>
  );
}
