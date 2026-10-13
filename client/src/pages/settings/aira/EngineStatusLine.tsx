import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { chatKeys, fetchHealth } from '@/components/aira/chatApi';
import { OpenConsoleButton } from './OpenConsoleButton';

/**
 * Baris status engine AIRA. Alamat & kunci engine diatur lewat ENV server
 * (AIRA_ENGINE_URL / AIRA_ENGINE_KEY), bukan di UI ini; pengaturan engine sendiri ada di
 * konsol engine (tombol "Buka konsol engine").
 */
export function EngineStatusLine() {
  const { t } = useTranslation('aira');
  const { data, isLoading } = useQuery({ queryKey: chatKeys.health, queryFn: fetchHealth, refetchInterval: 30_000, retry: false });
  const online = !!data?.online;
  const label = isLoading
    ? t('mcp.engine.checking')
    : !data?.configured
      ? t('mcp.engine.notConfigured')
      : online
        ? data.latencyMs !== null
          ? t('mcp.engine.connectedLatency', { latency: data.latencyMs })
          : t('mcp.engine.connected')
        : t('mcp.engine.offline');
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{t('mcp.engine.title')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('mcp.engine.description')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isLoading ? 'neutral' : online ? 'success' : 'warning'} role="status">
          <span aria-hidden className={online ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-warning'} />
          {label}
        </Badge>
        {online && <OpenConsoleButton />}
      </div>
    </div>
  );
}
