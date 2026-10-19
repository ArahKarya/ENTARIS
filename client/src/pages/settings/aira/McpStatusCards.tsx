import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatNumber } from '@/lib/format';
import { authorizationHeader, healthCurl, initializeCurl, mcpUrl, normalizeBaseUrl } from '@/lib/mcpEndpoint';
import { ConfirmDialog, Field, LoadingState } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { CodeLine } from './CopyButton';
import { MCP_STATUS_KEY } from './keys';
import { EngineStatusLine } from './EngineStatusLine';

export interface McpStatus {
  enabled: boolean;
  endpoint: { path: string; transport: string; stateless: boolean };
  secretKeySource: 'MCP_SECRET_KEY' | 'JWT_SECRET';
  tokens: { active: number; total: number };
  calls24h: { total: number; allowed?: number; queued?: number; denied?: number; error?: number };
  tools: { total: number; enabled: number };
}


function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-1 text-xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;
}

/** Status layanan + kill switch (AiSetting.agenticEnabled). */
export function McpStatusCard() {
  const { t } = useTranslation('aira');
  const qc = useQueryClient();
  const canEdit = can('settings', 'edit');
  const [confirmOff, setConfirmOff] = useState(false);

  const { data: status } = useQuery<McpStatus>({
    queryKey: MCP_STATUS_KEY,
    queryFn: async () => (await api.get('/ai/mcp/status')).data,
    refetchInterval: 30000,
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => api.put('/ai/mcp/status', { agenticEnabled: enabled }),
    onSuccess: (_r, enabled) => {
      qc.invalidateQueries({ queryKey: MCP_STATUS_KEY });
      toast.success(t(enabled ? 'mcp.status.enabled' : 'mcp.status.disabled'));
    },
    onError: (e) => toast.error(apiError(e, t('mcp.status.toggleFailed'))),
  });

  return (
    <SettingsCard
      title={t('mcp.status.title')}
      description={t('mcp.status.description')}
      actions={status && (
        <Badge variant={status.enabled ? 'success' : 'danger'} className="gap-1.5">
          <span aria-hidden className={status.enabled ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-danger'} />
          {t(status.enabled ? 'mcp.status.active' : 'mcp.status.inactive')}
        </Badge>
      )}
    >
      {!status ? (
        <LoadingState label={t('mcp.status.loading')} />
      ) : (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p id="mcp-enabled-label" className="text-sm font-medium text-foreground">{t('mcp.status.killSwitch')}</p>
              <p id="mcp-enabled-desc" className="mt-0.5 text-xs text-muted-foreground">
                {t('mcp.status.killSwitchDescription')}
              </p>
            </div>
            <Switch
              checked={status.enabled}
              disabled={!canEdit || toggle.isPending}
              onCheckedChange={(v) => (v ? toggle.mutate(true) : setConfirmOff(true))}
              aria-labelledby="mcp-enabled-label"
              aria-describedby="mcp-enabled-desc"
            />
          </div>

          <EngineStatusLine />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('mcp.status.activeTokens')} value={formatNumber(status.tokens.active)} hint={t('mcp.status.tokensOf', { count: status.tokens.total, total: formatNumber(status.tokens.total) })} />
            <Stat label={t('mcp.status.calls24h')} value={formatNumber(status.calls24h.total)} hint={t('mcp.status.awaitingApproval', { queued: formatNumber(status.calls24h.queued ?? 0) })} />
            <Stat label={t('mcp.status.deniedErrors')} value={`${formatNumber(status.calls24h.denied ?? 0)} / ${formatNumber(status.calls24h.error ?? 0)}`} hint={t('mcp.status.last24h')} />
            <Stat label={t('mcp.status.activeTools')} value={`${formatNumber(status.tools.enabled)}/${formatNumber(status.tools.total)}`} hint={t('mcp.status.registryCatalog')} />
          </div>

          {status.secretKeySource === 'JWT_SECRET' && (
            <p className="flex items-start gap-2 rounded-md bg-info-subtle px-3 py-2 text-xs text-info-text">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{t('mcp.status.jwtSecretNotice')}</span>
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        tone="danger"
        title={t('mcp.status.confirmOffTitle')}
        description={t('mcp.status.confirmOffDescription')}
        confirmLabel={t('mcp.status.confirmOff')}
        onConfirm={() => toggle.mutateAsync(false)}
      />
    </SettingsCard>
  );
}

const BASE_KEY = 'aira-mcp-base-url';

function initialBase(): string {
  try {
    return localStorage.getItem(BASE_KEY) || window.location.origin;
  } catch {
    return window.location.origin;
  }
}

/** Info endpoint + header Authorization + cek kesehatan yang berlaku untuk klien MCP mana pun. */
export function McpEndpointCard() {
  const { t } = useTranslation('aira');
  const [base, setBase] = useState(initialBase);
  const clean = normalizeBaseUrl(base) || window.location.origin;

  const change = (v: string) => {
    setBase(v);
    try {
      localStorage.setItem(BASE_KEY, v);
    } catch {
      /* penyimpanan lokal opsional */
    }
  };

  return (
    <SettingsCard
      title={t('mcp.endpoint.title')}
      description={t('mcp.endpoint.description')}
    >
      <div className="space-y-4">
        <Field
          label={t('mcp.endpoint.baseUrl')}
          hint={t('mcp.endpoint.baseUrlHint')}
        >
          <Input value={base} onChange={(e) => change(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} className="font-mono" />
        </Field>
        <CodeLine label={t('mcp.endpoint.url')} value={mcpUrl(clean)} what={t('mcp.endpoint.url')} />
        <CodeLine label={t('mcp.endpoint.authHeader')} value={authorizationHeader()} what={t('mcp.endpoint.authHeaderWhat')} />
        <CodeLine label={t('mcp.endpoint.healthCheck')} value={healthCurl(clean)} what={t('mcp.endpoint.curlWhat')} />
        <CodeLine label={t('mcp.endpoint.initialize')} value={initializeCurl(clean)} what={t('mcp.endpoint.initializeWhat')} />
      </div>
    </SettingsCard>
  );
}
