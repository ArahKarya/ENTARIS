import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Loader2, Calculator } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { formatRupiah } from '../../lib/formatters';
import { cn } from '../../lib/utils';

interface SkuRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  totalQty: number;
  totalRevenue: number;
  materialCogs: number;
  loadedCogs: number;
  materialMargin: number;
  loadedMargin: number;
  materialMarginPct: number;
  loadedMarginPct: number;
  coveragePct: number;
}

interface ApiResponse {
  items: SkuRow[];
  summary: {
    totalRevenue: number;
    materialMarginPct: number;
    loadedMarginPct: number;
  };
}

interface Props {
  startDate: string;
  endDate: string;
}

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function ProfitabilityPerSku({ startDate, endDate }: Props) {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ['dashboard-profitability-per-sku', startDate, endDate],
    queryFn: async () => (
      await api.get('/reports/profitability-per-sku', { params: { startDate, endDate } })
    ).data,
  });

  const rows = (data?.items ?? []).slice(0, 10);

  return (
    <div className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Profitabilitas per SKU
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Margin Material vs Loaded HPP (top 10 by revenue)
          </p>
        </div>
        <Link
          to="/reports/profitability-per-sku"
          className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
          title="Lihat laporan lengkap"
        >
          <Calculator size={16} className="text-emerald-600" />
        </Link>
      </div>

      {isLoading || !data ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Calculator size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Belum ada penjualan terkait inventory pada periode ini</p>
        </div>
      ) : (
        <>
          {/* Header summary */}
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="rounded-lg border border-gray-100 dark:border-gray-700 px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Revenue</p>
              <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {formatRupiah(data.summary.totalRevenue)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-700 px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Mat. Margin</p>
              <p className={cn('text-xs font-semibold tabular-nums',
                data.summary.materialMarginPct >= 0 ? 'text-green-600' : 'text-red-600')}>
                {fmtPct(data.summary.materialMarginPct)}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Loaded Margin</p>
              <p className={cn('text-xs font-bold tabular-nums',
                data.summary.loadedMarginPct >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                {fmtPct(data.summary.loadedMarginPct)}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <th className="text-left py-1.5 px-1.5 font-medium text-[10px] uppercase tracking-wide"
                    style={{ color: 'var(--color-text-muted)' }}>
                    Produk
                  </th>
                  <th className="text-right py-1.5 px-1.5 font-medium text-[10px] uppercase tracking-wide"
                    style={{ color: 'var(--color-text-muted)' }}>
                    Revenue
                  </th>
                  <th className="text-right py-1.5 px-1.5 font-medium text-[10px] uppercase tracking-wide"
                    style={{ color: 'var(--color-text-muted)' }}>
                    Mat %
                  </th>
                  <th className="text-right py-1.5 px-1.5 font-medium text-[10px] uppercase tracking-wide bg-emerald-50/30"
                    style={{ color: 'var(--color-text-muted)' }}>
                    Loaded %
                  </th>
                  <th className="text-center py-1.5 px-1.5 font-medium text-[10px] uppercase tracking-wide"
                    style={{ color: 'var(--color-text-muted)' }}>
                    Cov
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.itemId} className="border-b last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                    style={{ borderColor: 'var(--color-border)' }}>
                    <td className="py-1.5 px-1.5 max-w-[180px]">
                      <p className="truncate font-medium text-[11px]" style={{ color: 'var(--color-text-primary)' }}>
                        {r.itemName}
                      </p>
                      <p className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                        {r.itemCode}
                      </p>
                    </td>
                    <td className="py-1.5 px-1.5 text-right tabular-nums"
                      style={{ color: 'var(--color-text-secondary)' }}>
                      {formatRupiah(r.totalRevenue)}
                    </td>
                    <td className="py-1.5 px-1.5 text-right tabular-nums">
                      <span className={cn('inline-flex items-center gap-0.5',
                        r.materialMarginPct >= 20 ? 'text-green-600'
                        : r.materialMarginPct >= 0 ? 'text-amber-600'
                        : 'text-red-600')}>
                        {r.materialMarginPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {fmtPct(r.materialMarginPct)}
                      </span>
                    </td>
                    <td className="py-1.5 px-1.5 text-right tabular-nums bg-emerald-50/30">
                      <span className={cn(
                        r.loadedMarginPct >= 20 ? 'text-green-600'
                        : r.loadedMarginPct >= 0 ? 'text-amber-600'
                        : 'text-red-600'
                      )}>
                        {fmtPct(r.loadedMarginPct)}
                      </span>
                    </td>
                    <td className="py-1.5 px-1.5 text-center">
                      <span className={cn(
                        'badge text-[10px]',
                        r.coveragePct === 100 ? 'badge-green'
                        : r.coveragePct >= 50 ? 'badge-yellow'
                        : 'badge-gray'
                      )}>
                        {r.coveragePct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
            <span className="font-semibold">Coverage</span> = % line yg link ke batch (Phase 5). 100% = loaded margin paling akurat.
          </p>
        </>
      )}
    </div>
  );
}
