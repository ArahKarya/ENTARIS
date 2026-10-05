import { useQuery } from '@tanstack/react-query';
import { Coins, Percent, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ExportMenu,
  ReportDataTable,
  ReportFilters,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  periodLabel,
  toIso,
  useReportRange,
  type DataColumn,
} from '@/components/report-kit';

interface HppItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  category: string;
  totalQty: number;
  totalRevenue: number;
  totalCogs: number;
  grossMargin: number;
  marginPct: number;
}

interface HppData {
  period: { start: string; end: string };
  items: HppItem[];
  summary: { totalRevenue: number; totalCogs: number; grossProfit: number; grossMarginPct: number };
}

/** Margin tone: >= 20% good, >= 0 watch, < 0 loss. The icon + sign carry the meaning, colour only reinforces it. */
const marginTone = (pct: number) => (pct >= 20 ? 'text-success-text' : pct >= 0 ? 'text-warning-text' : 'text-danger-text');

const COLUMNS: DataColumn<HppItem>[] = [
  { key: 'code', header: 'Kode', render: (r) => r.itemCode, className: 'whitespace-nowrap font-mono text-xs' },
  { key: 'name', header: 'Produk', rowHeader: true, render: (r) => r.itemName },
  {
    key: 'category',
    header: 'Kategori',
    hideBelowSm: true,
    render: (r) => <span className="rounded-md bg-neutral-subtle px-2 py-0.5 text-xs text-neutral-text">{r.category}</span>,
  },
  { key: 'qty', header: 'Qty', numeric: true, render: (r) => formatNumber(r.totalQty) },
  { key: 'revenue', header: 'Pendapatan', numeric: true, render: (r) => formatRupiah(r.totalRevenue, { symbol: false }) },
  { key: 'cogs', header: 'HPP', numeric: true, render: (r) => formatRupiah(r.totalCogs, { symbol: false }) },
  {
    key: 'margin',
    header: 'Laba Kotor',
    numeric: true,
    className: (r) => cn('font-medium', r.grossMargin < 0 && 'text-danger-text'),
    render: (r) => formatRupiah(r.grossMargin, { symbol: false, negative: 'parens' }),
  },
  {
    key: 'pct',
    header: 'Margin',
    numeric: true,
    render: (r) => (
      <span className={cn('inline-flex items-center justify-end gap-1', marginTone(r.marginPct))}>
        {r.marginPct >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
        {r.marginPct}%
      </span>
    ),
  },
];

export default function HppReport() {
  const now = new Date();
  const { startDate, endDate, setRange } = useReportRange({ startDate: `${now.getFullYear()}-01-01`, endDate: toIso(now) });

  const { data, isLoading, isError, refetch } = useQuery<HppData>({
    queryKey: ['report-hpp', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/reports/hpp', { params: { startDate, endDate } });
      return res.data;
    },
  });

  const summary = data?.summary;

  return (
    <ReportPage
      title="HPP per Produk"
      description="Pendapatan, harga pokok penjualan, dan margin kotor per produk"
      period={periodLabel({ startDate, endDate })}
      actions={<ExportMenu disabled={isLoading || isError} />}
      filters={<ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange} />}
      summary={
        <ReportSummaryCards
          loading={isLoading}
          items={[
            { label: 'Total Pendapatan', value: summary?.totalRevenue ?? 0, icon: Wallet, tone: 'neutral' },
            { label: 'Total HPP', value: summary?.totalCogs ?? 0, icon: Coins, tone: 'neutral' },
            { label: 'Laba Kotor', value: summary?.grossProfit ?? 0, icon: TrendingUp },
            {
              label: 'Margin Kotor',
              value: summary?.grossMarginPct ?? 0,
              formatted: `${summary?.grossMarginPct ?? 0}%`,
              icon: Percent,
            },
          ]}
        />
      }
    >
      <ReportState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!data && data.items.length === 0}
        onRetry={() => refetch()}
      >
        <ReportDataTable
          caption={`HPP per produk, ${periodLabel({ startDate, endDate })}`}
          columns={COLUMNS}
          rows={data?.items ?? []}
          getRowKey={(r) => r.itemId}
        />
      </ReportState>
    </ReportPage>
  );
}
