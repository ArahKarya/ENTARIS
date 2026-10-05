import { useQuery } from '@tanstack/react-query';
import { Calculator, TrendingDown, TrendingUp } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { MiniTable } from '../dashboard-kit/MiniTable';

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
  summary: { totalRevenue: number; materialMarginPct: number; loadedMarginPct: number };
}

interface Props {
  startDate: string;
  endDate: string;
}

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const marginTone = (p: number) => (p >= 20 ? 'text-success-text' : p >= 0 ? 'text-warning-text' : 'text-danger-text');

export default function ProfitabilityPerSku({ startDate, endDate }: Props) {
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-profitability-per-sku', startDate, endDate],
    queryFn: async () => (await api.get('/reports/profitability-per-sku', { params: { startDate, endDate } })).data,
  });
  const rows = (data?.items ?? []).slice(0, 10);

  return (
    <WidgetCard
      title="Profitabilitas per SKU"
      description="Margin material vs loaded HPP (10 teratas berdasarkan pendapatan)"
      icon={Calculator}
      href="/reports/profitability-per-sku"
      hrefLabel="Laporan lengkap"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={Calculator}
      emptyText="Belum ada penjualan terkait inventory pada periode ini"
      minHeight={240}
    >
      {data && (
        <>
          <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
            {[
              ['Pendapatan', formatRupiah(data.summary.totalRevenue, { compact: true }), 'text-foreground'],
              ['Margin material', fmtPct(data.summary.materialMarginPct), marginTone(data.summary.materialMarginPct)],
              ['Margin loaded', fmtPct(data.summary.loadedMarginPct), marginTone(data.summary.loadedMarginPct)],
            ].map(([k, v, tone]) => (
              <div key={k} className="rounded-md border border-border px-2 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className={cn('num text-sm font-semibold', tone)}>{v}</dd>
              </div>
            ))}
          </dl>
          <MiniTable
            caption="Profitabilitas per SKU"
            maxHeightClass="max-h-96"
            rows={rows}
            rowKey={(r) => r.itemId}
            columns={[
              { key: 'name', label: 'Produk' },
              { key: 'rev', label: 'Pendapatan', numeric: true, hideOnMobile: true },
              { key: 'mat', label: 'Mat %', numeric: true },
              { key: 'loaded', label: 'Loaded %', numeric: true },
              { key: 'cov', label: 'Cakupan', numeric: true, hideOnMobile: true },
            ]}
            cell={(r, k) => {
              switch (k) {
                case 'name':
                  return (
                    <div className="max-w-[180px]">
                      <p className="truncate font-medium">{r.itemName}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{r.itemCode}</p>
                    </div>
                  );
                case 'rev':
                  return formatRupiah(r.totalRevenue);
                case 'mat': {
                  const Icon = r.materialMarginPct >= 0 ? TrendingUp : TrendingDown;
                  return (
                    <span className={cn('inline-flex items-center gap-0.5', marginTone(r.materialMarginPct))}>
                      <Icon className="size-3" aria-hidden />
                      {fmtPct(r.materialMarginPct)}
                    </span>
                  );
                }
                case 'loaded':
                  return <span className={marginTone(r.loadedMarginPct)}>{fmtPct(r.loadedMarginPct)}</span>;
                default:
                  return <Badge variant={r.coveragePct === 100 ? 'success' : r.coveragePct >= 50 ? 'warning' : 'neutral'}>{r.coveragePct}%</Badge>;
              }
            }}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="font-semibold">Cakupan</span> = persentase baris yang terhubung ke batch. 100% berarti margin loaded paling akurat.
          </p>
        </>
      )}
    </WidgetCard>
  );
}
