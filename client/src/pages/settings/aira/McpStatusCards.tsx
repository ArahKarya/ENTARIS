import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
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
      toast.success(enabled ? 'AIRA (MCP) diaktifkan.' : 'AIRA (MCP) dinonaktifkan. Semua panggilan ditolak.');
    },
    onError: (e) => toast.error(apiError(e, 'Gagal mengubah status.')),
  });

  return (
    <SettingsCard
      title="Status AIRA (MCP)"
      description="Entaris menyajikan seluruh tool ke mesin AI (engine AIRA) lewat satu endpoint MCP. Hak akses mengikuti pengguna yang sedang dilayani."
      actions={status && (
        <Badge variant={status.enabled ? 'success' : 'danger'} className="gap-1.5">
          <span aria-hidden className={status.enabled ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-danger'} />
          {status.enabled ? 'Aktif' : 'Nonaktif'}
        </Badge>
      )}
    >
      {!status ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p id="mcp-enabled-label" className="text-sm font-medium text-foreground">Layanan AIRA aktif (kill switch)</p>
              <p id="mcp-enabled-desc" className="mt-0.5 text-xs text-muted-foreground">
                Saat dimatikan, setiap panggilan ke /mcp ditolak seketika dengan galat 503. Tidak ada tool yang berjalan.
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
            <Stat label="Token aktif" value={formatNumber(status.tokens.active)} hint={`dari ${formatNumber(status.tokens.total)} token`} />
            <Stat label="Panggilan 24 jam" value={formatNumber(status.calls24h.total)} hint={`${formatNumber(status.calls24h.queued ?? 0)} menunggu persetujuan`} />
            <Stat label="Ditolak / galat" value={`${formatNumber(status.calls24h.denied ?? 0)} / ${formatNumber(status.calls24h.error ?? 0)}`} hint="24 jam terakhir" />
            <Stat label="Tool aktif" value={`${formatNumber(status.tools.enabled)}/${formatNumber(status.tools.total)}`} hint="katalog registry" />
          </div>

          {status.secretKeySource === 'JWT_SECRET' && (
            <p className="flex items-start gap-2 rounded-md bg-info-subtle px-3 py-2 text-xs text-info-text">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Signing secret token dienkripsi dengan kunci turunan JWT_SECRET. Disarankan mengisi MCP_SECRET_KEY terpisah
                agar rotasi JWT_SECRET tidak membuat secret token tak terbaca.
              </span>
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        tone="danger"
        title="Matikan AIRA (MCP)?"
        description="Semua panggilan dari engine AIRA ditolak (503) sampai Anda mengaktifkannya lagi. Pengajuan yang sudah menunggu persetujuan tidak terpengaruh."
        confirmLabel="Matikan"
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
      title="Endpoint MCP"
      description="Satu endpoint untuk semua tool (Streamable HTTP, stateless). Jangkau lewat jaringan privat; jangan dibuka ke internet publik."
    >
      <div className="space-y-4">
        <Field
          label="Alamat dasar Entaris"
          hint="Alamat yang dipakai klien MCP untuk menjangkau Entaris (mis. alamat jaringan privat). Hanya mengubah contoh di bawah."
        >
          <Input value={base} onChange={(e) => change(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} className="font-mono" />
        </Field>
        <CodeLine label="URL endpoint" value={mcpUrl(clean)} what="URL endpoint" />
        <CodeLine label="Header Authorization (ganti <TOKEN_MCP>)" value={authorizationHeader()} what="header Authorization" />
        <CodeLine label="Cek jangkauan (tanpa token)" value={healthCurl(clean)} what="perintah curl" />
        <CodeLine label="Uji JSON-RPC initialize (ganti <TOKEN_MCP>)" value={initializeCurl(clean)} what="perintah curl initialize" />
      </div>
    </SettingsCard>
  );
}
