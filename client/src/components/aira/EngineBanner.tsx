// Shown while the AIRA service is switched off or the engine is offline: retry, plus a Settings
// link when isAdmin.

import { Link } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { EngineHealth } from './types';

interface EngineBannerProps {
  health: EngineHealth | undefined;
  checking: boolean;
  isAdmin: boolean;
  onRetry: () => void;
}

export function EngineBanner({ health, checking, isAdmin, onRetry }: EngineBannerProps) {
  const { t } = useTranslation('aira');
  if (!health) return null;
  const disabled = health.agenticEnabled === false;
  if (!disabled && health.online) return null;
  const msg = disabled
    ? t('engineBanner.disabled')
    : !health.configured
    ? t('engineBanner.notConfigured')
    : health.reason === 'auth'
      ? t('engineBanner.keyRejected')
      : t('engineBanner.offline');
  return (
    <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning-text">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {msg} {!disabled && t('engineBanner.keepMessages')}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry} loading={checking}>
        {t('engineBanner.retry')}
      </Button>
      {isAdmin && (
        <Link to="/settings?tab=agentic" className="text-xs font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t('engineBanner.openSettings')}
        </Link>
      )}
    </div>
  );
}
