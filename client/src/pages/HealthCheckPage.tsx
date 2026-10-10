/**
 * Data integrity checks (/health-check). A fix is previewed before it is POSTed; fixes mutate
 * ledger data, so they are shown only with audit:edit (the server gates the POST the same way).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, ListChecks, Play, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, EmptyState, LoadingState, PageHeader, StatCard } from '@/components/shared';

type CheckStatus = 'ok' | 'warning' | 'error';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  count: number;
  details?: Record<string, unknown>[];
  fixable: boolean;
}

interface HealthData {
  status: CheckStatus;
  checks: CheckResult[];
}

interface PreviewData {
  check: string;
  description: string;
  warning?: string;
  count: number;
  details: Record<string, unknown>[];
}

interface CheckInfo {
  title: string;
  /** What the automatic fix changes, stated up front in the confirmation. */
  fixKey?: string;
  fixEffect?: string;
}

/** Server check name → Indonesian title and fix metadata. */
const CHECKS: Record<string, CheckInfo> = {
  'ALE vs JournalItem Sync': {
    title: 'Sinkronisasi buku besar (ALE) dengan jurnal',
    fixKey: 'ale-sync',
    fixEffect: 'Baris buku besar (ALE) yang berasal dari jurnal dihapus lalu dibuat ulang dari jurnal yang ada.',
  },
  'Account Balance Drift': {
    title: 'Selisih saldo akun',
    fixKey: 'account-balance-drift',
    fixEffect: 'Saldo tersimpan akun yang selisih ditimpa dengan saldo hasil hitung ulang dari buku besar.',
  },
  'Unbalanced Journal Entries': { title: 'Jurnal tidak seimbang' },
  'Orphan ALE Entries': {
    title: 'Baris buku besar tanpa dokumen (ALE yatim)',
    fixKey: 'orphan-ale',
    fixEffect: 'Baris buku besar yang dokumen sumbernya sudah tidak ada akan dihapus.',
  },
  'Stock vs Movement Mismatch': { title: 'Stok tidak sesuai mutasi' },
  'Drift Stok per Gudang': { title: 'Selisih stok per gudang' },
};

const STATUS: Record<CheckStatus, { label: string; icon: LucideIcon; className: string }> = {
  ok: { label: 'OK', icon: CheckCircle2, className: 'text-success-text' },
  warning: { label: 'Peringatan', icon: AlertTriangle, className: 'text-warning-text' },
  error: { label: 'Gagal', icon: XCircle, className: 'text-danger-text' },
};

const PREVIEW_ROWS = 50;

function StatusLabel({ status, className }: { status: CheckStatus; className?: string }) {
  const meta = STATUS[status];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', meta.className, className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {meta.label}
    </span>
  );
}

function formatColumnName(key: string): string {
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? formatNumber(val) : formatNumber(val, { decimals: 2 });
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function DetailTable({ rows, caption }: { rows: Record<string, unknown>[]; caption: string }) {
  if (rows.length === 0) return null;
  const keys = Object.keys(rows[0]);
  return (
    // Focusable so keyboard users can scroll wide tables horizontally (axe scrollable-region-focusable).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div role="region" aria-label={caption} tabIndex={0} className="max-w-full overflow-x-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {keys.map((k) => (
              <th key={k} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                {formatColumnName(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {keys.map((k) => (
                <td key={k} className="whitespace-nowrap px-3 py-1.5 text-foreground">
                  {formatCellValue(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HealthCheckPage() {
  const queryClient = useQueryClient();
  const canFix = can('audit', 'edit');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ key: string; info: CheckInfo } | null>(null);

  const healthQuery = useQuery<HealthData>({
    queryKey: ['health-check'],
    queryFn: async () => (await api.get('/health-check')).data.data,
  });

  const previewQuery = useQuery<PreviewData>({
    queryKey: ['health-check-preview', confirm?.key],
    queryFn: async () => (await api.get(`/health-check/preview/${confirm!.key}`)).data.data,
    enabled: !!confirm,
  });

  const fixMutation = useMutation({
    mutationFn: async (key: string) => (await api.post(`/health-check/fix/${key}`)).data.data as { message: string },
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['health-check'] });
    },
    onError: () => toast.error('Gagal memperbaiki masalah.'),
  });

  const data = healthQuery.data;
  const checks = data?.checks ?? [];
  const counts = { ok: 0, warning: 0, error: 0 } as Record<CheckStatus, number>;
  for (const c of checks) counts[c.status] += 1;
  const issues = checks.reduce((sum, c) => sum + (c.status === 'ok' ? 0 : c.count), 0);
  const ranAt = healthQuery.dataUpdatedAt ? formatDateTime(healthQuery.dataUpdatedAt) : null;
  const loadingKpi = !data && !healthQuery.isError;

  const preview = previewQuery.data;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Pemeriksaan Sistem"
        description={
          ranAt
            ? `Pemeriksaan integritas data buku besar dan stok. Terakhir dijalankan ${ranAt}.`
            : 'Pemeriksaan integritas data buku besar dan stok.'
        }
        actions={
          <Button onClick={() => healthQuery.refetch()} loading={healthQuery.isFetching}>
            <Play aria-hidden />
            Jalankan pemeriksaan
          </Button>
        }
      />

      <section aria-label="Ringkasan hasil pemeriksaan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Status Keseluruhan"
          icon={ListChecks}
          loading={loadingKpi}
          value={data ? STATUS[data.status].label : '—'}
          hint={data ? `${formatNumber(counts.ok)} dari ${formatNumber(checks.length)} lolos` : undefined}
        />
        <StatCard label="OK" icon={CheckCircle2} loading={loadingKpi} value={data ? formatNumber(counts.ok) : '—'} />
        <StatCard
          label="Peringatan"
          icon={AlertTriangle}
          loading={loadingKpi}
          value={data ? formatNumber(counts.warning) : '—'}
        />
        <StatCard
          label="Gagal"
          icon={XCircle}
          loading={loadingKpi}
          value={data ? formatNumber(counts.error) : '—'}
          hint={data ? `${formatNumber(issues)} temuan` : undefined}
        />
      </section>

      {healthQuery.isLoading && <LoadingState label="Memeriksa kesehatan sistem…" />}
      {healthQuery.isError && !data && (
        <EmptyState
          kind="error"
          title="Pemeriksaan gagal dijalankan"
          description="Coba jalankan ulang beberapa saat lagi."
          action={
            <Button size="sm" variant="outline" onClick={() => healthQuery.refetch()}>
              Coba lagi
            </Button>
          }
        />
      )}

      {data && (
        <ul aria-label="Daftar pemeriksaan" className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {checks.map((check) => {
            const info = CHECKS[check.name] ?? { title: check.name };
            const details = check.details ?? [];
            const isOpen = !!expanded[check.name];
            const panelId = `check-${check.name.replace(/\W+/g, '-')}`;
            const showFix = canFix && check.status !== 'ok' && check.fixable && !!info.fixKey;
            return (
              <li key={check.name} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusLabel status={check.status} />
                      <h2 className="text-sm font-semibold text-foreground">{info.title}</h2>
                    </div>
                    <p className="break-words text-sm text-muted-foreground">{check.message}</p>
                    {check.status !== 'ok' && check.count > 0 && (
                      <p className="text-xs text-muted-foreground">{formatNumber(check.count)} temuan</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {details.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => setExpanded((prev) => ({ ...prev, [check.name]: !prev[check.name] }))}
                      >
                        <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} aria-hidden />
                        {isOpen ? 'Sembunyikan detail' : 'Lihat detail'}
                      </Button>
                    )}
                    {showFix && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirm({ key: info.fixKey!, info })}
                        disabled={fixMutation.isPending}
                      >
                        <Wrench aria-hidden />
                        Perbaiki
                      </Button>
                    )}
                  </div>
                </div>
                {isOpen && details.length > 0 && (
                  <div id={panelId} className="mt-3">
                    <DetailTable rows={details} caption={`Detail ${info.title}`} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        tone="danger"
        title={confirm ? `Perbaiki: ${confirm.info.title}?` : ''}
        description={confirm?.info.fixEffect}
        confirmLabel="Ya, perbaiki"
        loading={previewQuery.isLoading}
        onConfirm={() => fixMutation.mutateAsync(confirm!.key)}
      >
        <div className="max-h-[50dvh] min-w-0 space-y-3 overflow-y-auto text-sm">
          {previewQuery.isLoading && <p className="text-muted-foreground">Memuat pratinjau perubahan…</p>}
          {previewQuery.isError && <p className="text-danger-text">Gagal memuat pratinjau perubahan.</p>}
          {preview && (
            <>
              <p className="font-medium text-foreground">{preview.description}</p>
              {preview.warning && (
                <p className="rounded-md bg-warning-subtle px-3 py-2 text-warning-text">{preview.warning}</p>
              )}
              <DetailTable rows={preview.details.slice(0, PREVIEW_ROWS)} caption="Baris yang akan diubah" />
              {preview.details.length > PREVIEW_ROWS && (
                <p className="text-xs text-muted-foreground">
                  Menampilkan {formatNumber(PREVIEW_ROWS)} dari {formatNumber(preview.details.length)} baris. Semua akan
                  diproses saat perbaikan dijalankan.
                </p>
              )}
              <p className="text-xs text-muted-foreground">Perbaikan dicatat di Jejak Audit.</p>
            </>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
