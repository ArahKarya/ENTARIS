/** Ringkasan pengajuan dari agen AIRA (documentType `ai_tool:<nama>`): apa yang diminta, siapa, lewat mana. */
import {  } from 'lucide-react';
import { AiraIcon } from '@/components/shell/AiraIcon';

interface AiToolPayload {
  tool?: string;
  args?: Record<string, unknown>;
  confirm?: string;
  actor?: { name?: string; role?: string; jabatan?: string | null };
  tokenName?: string;
  channel?: string | null;
  risk?: string;
  lastError?: string;
  result?: { status?: number; at?: string };
}

export function AiToolApprovalSummary({ payload, status }: { payload: Record<string, unknown> | null | undefined; status: string }) {
  const p = (payload ?? {}) as AiToolPayload;
  const args = p.args ?? {};
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2.5">
        <AiraIcon size={16} className="mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{p.confirm || p.tool || 'Permintaan AIRA'}</p>
          <p className="text-xs text-muted-foreground">
            Tool <span className="font-mono">{p.tool ?? '—'}</span> ({p.risk ?? '—'}) · diminta {p.actor?.name ?? '—'}
            {p.actor?.jabatan ? ` (${p.actor.jabatan})` : ''} lewat {p.channel ?? 'MCP'}
            {p.tokenName ? ` · token ${p.tokenName}` : ''}
          </p>
        </div>
      </div>
      {p.lastError && status === 'Pending' && (
        <p role="alert" className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning-text">
          <span className="font-medium">Percobaan sebelumnya gagal:</span> {p.lastError}
        </p>
      )}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-foreground">Argumen</p>
        <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-card p-3 font-mono text-xs text-foreground">
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>
      <p className="text-xs text-muted-foreground">
        Saat disetujui, permintaan dijalankan sebagai {p.actor?.name ?? 'pengaju'} (hak akses perannya + aturan persetujuan normal).
        Ditolak = tidak ada yang dijalankan.
      </p>
    </div>
  );
}
