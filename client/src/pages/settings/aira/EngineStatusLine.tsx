import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { chatKeys, fetchHealth } from '@/components/aira/chatApi';

/**
 * Baris status engine AIRA (hanya baca). Alamat & kunci engine diatur lewat ENV server
 * (AIRA_ENGINE_URL / AIRA_ENGINE_KEY), bukan di UI ini.
 */
export function EngineStatusLine() {
  const { data, isLoading } = useQuery({ queryKey: chatKeys.health, queryFn: fetchHealth, refetchInterval: 30_000, retry: false });
  const online = !!data?.online;
  const label = isLoading
    ? 'Memeriksa…'
    : !data?.configured
      ? 'Belum dikonfigurasi'
      : online
        ? `Terhubung${data.latencyMs !== null ? ` · ${data.latencyMs} ms` : ''}`
        : 'Offline';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Engine AIRA (panel chat)</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Alamat dan kunci engine diatur lewat variabel lingkungan server (AIRA_ENGINE_URL, AIRA_ENGINE_KEY).</p>
      </div>
      <Badge variant={isLoading ? 'neutral' : online ? 'success' : 'warning'} role="status">
        <span aria-hidden className={online ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-warning'} />
        {label}
      </Badge>
    </div>
  );
}
