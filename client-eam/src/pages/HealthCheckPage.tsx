import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HeartPulse,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Wrench,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface PreviewData {
  check: string;
  description: string;
  warning?: string;
  count: number;
  details: Record<string, unknown>[];
}

interface CheckDetail {
  [key: string]: unknown;
}

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  count: number;
  details?: CheckDetail[];
  fixable: boolean;
}

interface HealthData {
  status: 'ok' | 'warning' | 'error';
  checks: CheckResult[];
}

const CHECK_FIX_KEYS: Record<string, string> = {
  'ALE vs JournalItem Sync': 'ale-sync',
  'Account Balance Drift': 'account-balance-drift',
  'Orphan ALE Entries': 'orphan-ale',
};

const statusConfig = {
  ok: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'OK' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Peringatan' },
  error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Error' },
};

export default function HealthCheckPage() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmCheck, setConfirmCheck] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<HealthData>({
    queryKey: ['health-check'],
    queryFn: async () => {
      const res = await api.get('/health-check');
      return res.data.data;
    },
  });

  const previewQuery = useQuery<PreviewData>({
    queryKey: ['health-check-preview', confirmCheck],
    queryFn: async () => {
      const res = await api.get(`/health-check/preview/${confirmCheck}`);
      return res.data.data;
    },
    enabled: !!confirmCheck,
  });

  const fixMutation = useMutation({
    mutationFn: async (checkKey: string) => {
      const res = await api.post(`/health-check/fix/${checkKey}`);
      return res.data.data;
    },
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['health-check'] });
      setConfirmCheck(null);
    },
    onError: () => {
      toast.error('Gagal memperbaiki masalah');
    },
  });

  const toggleExpand = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const overallStatus = data?.status ?? 'ok';
  const overallConfig = statusConfig[overallStatus];
  const OverallIcon = overallConfig.icon;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <HeartPulse size={24} className="text-blue-600" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Health Check
          </h1>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary"
        >
          <RefreshCw size={16} className={cn(isFetching && 'animate-spin')} />
          Periksa Ulang
        </button>
      </div>

      {/* Overall Status */}
      {data && (
        <div className={cn('card p-4 mb-6 flex items-center gap-3', overallConfig.bg, overallConfig.border, 'border')}>
          <OverallIcon size={28} className={overallConfig.color} />
          <div>
            <p className={cn('font-semibold text-lg', overallConfig.color)}>
              Status: {overallConfig.label}
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {data.checks.filter((c) => c.status === 'ok').length} dari {data.checks.length} pemeriksaan lolos
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="card p-8 text-center">
          <RefreshCw size={32} className="animate-spin mx-auto mb-3 text-blue-500" />
          <p style={{ color: 'var(--color-text-secondary)' }}>Menjalankan pemeriksaan...</p>
        </div>
      )}

      {/* Check Results */}
      {data && (
        <div className="space-y-3">
          {data.checks.map((check) => {
            const config = statusConfig[check.status];
            const StatusIcon = config.icon;
            const isExpanded = expanded[check.name];
            const fixKey = CHECK_FIX_KEYS[check.name];
            const hasDetails = check.details && check.details.length > 0;

            return (
              <div key={check.name} className="card overflow-hidden">
                {/* Check header */}
                <div
                  className={cn(
                    'flex items-center gap-3 p-4 cursor-pointer',
                    hasDetails && 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                  )}
                  onClick={() => hasDetails && toggleExpand(check.name)}
                >
                  <StatusIcon size={20} className={cn(config.color, 'flex-shrink-0')} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {check.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {check.message}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {check.status !== 'ok' && check.count > 0 && (
                      <span className={cn('badge', check.status === 'error' ? 'badge-red' : 'badge-yellow')}>
                        {check.count} masalah
                      </span>
                    )}
                    {check.status !== 'ok' && check.fixable && fixKey && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmCheck(fixKey);
                        }}
                        disabled={fixMutation.isPending}
                        className="btn-primary text-xs py-1 px-2.5"
                        title="Perbaiki (dengan konfirmasi)"
                      >
                        <Wrench size={14} />
                        Perbaiki
                      </button>
                    )}
                    {hasDetails && (
                      isExpanded
                        ? <ChevronDown size={16} style={{ color: 'var(--color-text-muted)' }} />
                        : <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
                    )}
                  </div>
                </div>

                {/* Detail table */}
                {isExpanded && hasDetails && (
                  <div className="border-t px-4 pb-4 overflow-x-auto" style={{ borderColor: 'var(--color-border-light)' }}>
                    <table className="data-table mt-2">
                      <thead>
                        <tr>
                          {Object.keys(check.details![0]).map((key) => (
                            <th key={key} className="text-xs">
                              {formatColumnName(key)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {check.details!.map((row, idx) => (
                          <tr key={idx}>
                            {Object.values(row).map((val, vi) => (
                              <td key={vi} className="text-xs">
                                {formatCellValue(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Fix Modal */}
      {confirmCheck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !fixMutation.isPending && setConfirmCheck(null)}
        >
          <div
            className="card max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-600" />
                <h2 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Konfirmasi: {confirmCheck}
                </h2>
              </div>
              <button
                onClick={() => setConfirmCheck(null)}
                disabled={fixMutation.isPending}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-auto p-4">
              {previewQuery.isLoading && (
                <div className="py-8 text-center">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Memuat preview...
                  </p>
                </div>
              )}

              {previewQuery.isError && (
                <div className="py-4 text-center text-red-600">Gagal memuat preview</div>
              )}

              {previewQuery.data && (
                <>
                  <p className="text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>
                    {previewQuery.data.description}
                  </p>
                  {previewQuery.data.warning && (
                    <div className="mb-3 p-2 rounded border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                      ⚠️ {previewQuery.data.warning}
                    </div>
                  )}
                  {previewQuery.data.details.length > 0 && (
                    <div className="overflow-x-auto border rounded" style={{ borderColor: 'var(--color-border-light)' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            {Object.keys(previewQuery.data.details[0]).map((key) => (
                              <th key={key} className="text-xs">{formatColumnName(key)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewQuery.data.details.slice(0, 50).map((row, idx) => (
                            <tr key={idx}>
                              {Object.values(row).map((val, vi) => (
                                <td key={vi} className="text-xs">{formatCellValue(val)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {previewQuery.data.details.length > 50 && (
                        <p className="text-xs p-2" style={{ color: 'var(--color-text-muted)' }}>
                          Menampilkan 50 dari {previewQuery.data.details.length} baris. Semua akan diproses saat fix dijalankan.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t" style={{ borderColor: 'var(--color-border-light)' }}>
              <button
                onClick={() => setConfirmCheck(null)}
                disabled={fixMutation.isPending}
                className="btn-secondary"
              >
                Batal
              </button>
              <button
                onClick={() => fixMutation.mutate(confirmCheck)}
                disabled={fixMutation.isPending || previewQuery.isLoading}
                className="btn-primary"
              >
                {fixMutation.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Wrench size={14} />
                    Ya, Perbaiki
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatColumnName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return val.toLocaleString('id-ID');
    return val.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(val);
}
