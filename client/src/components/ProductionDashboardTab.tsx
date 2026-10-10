/**
 * Production dashboard. Server-side aggregates only; yield is input-weighted.
 * Period lives in the URL.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes, ClipboardCheck, Factory, Layers, PackageCheck, Percent, Coins } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '@/lib/api';
import { formatDate, formatDateTime, formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatCard, StatusBadge } from '@/components/shared';
import { CHART_AXIS, CHART_GRID_STROKE, useDashboardPeriod } from '@/components/inventory/dashboard-hooks';
import {
  ChartTooltipBox,
  Panel,
  PanelState,
  PeriodToolbar,
} from '@/components/inventory/dashboard-kit';
import {
  conversionCost,
  countDelta,
  formatYield,
  mainOutputQty,
  pointDelta,
  previousPeriod,
  topProductRows,
  yieldDomain,
  yieldTrendRows,
  type LoadedHppTotals,
  type ProductHpp,
  type TopProduct,
  type YieldTrendPoint,
} from '@/components/inventory/dashboard-model';
import { formatQty, type ProductionRunSummary } from '@/components/inventory/inventory-rows';
import {
  approvalRequestsKey,
  fetchApprovalRequests,
  formatQueueCount,
  waitingDays,
} from '@/components/inventory/approval-queue';

interface ProductionDashboardData {
  yieldTrend: YieldTrendPoint[];
  topOutputs: TopProduct[];
  recentProduction: Array<{
    id: string;
    runNumber: string;
    date: string;
    yieldPct: number | null;
    referenceNumber: string | null;
    totalInput: number;
    totalOutput: number;
    inputSummary: string;
    outputSummary: string;
  }>;
  loadedHpp: LoadedHppTotals & { perProduct: Array<ProductHpp & { itemName: string }> };
}

interface ProductionDashboardTabProps {
  /** Opens the production run detail drawer. */
  onOpenRun: (runId: string) => void;
}

const APPROVAL_HREF = '/inventory?tab=production&view=approval';
const linkClass =
  'inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function useRunSummary(range: { startDate: string; endDate: string }) {
  return useQuery({
    queryKey: ['production-runs', 'summary', { ...range, status: 'active' }],
    queryFn: async () =>
      (await api.get<ProductionRunSummary>('/inventory/production-runs/summary', { params: { ...range, status: 'active' } })).data,
    placeholderData: keepPreviousData,
  });
}

export default function ProductionDashboardTab({ onOpenRun }: ProductionDashboardTabProps) {
  const { period, setPreset, setRange } = useDashboardPeriod();
  const range = useMemo(() => ({ startDate: period.startDate, endDate: period.endDate }), [period.startDate, period.endDate]);
  const prevRange = useMemo(() => previousPeriod(range), [range]);

  const summaryQuery = useRunSummary(range);
  const prevQuery = useRunSummary(prevRange);
  const dashQuery = useQuery({
    queryKey: ['production-dashboard', range],
    queryFn: async () => (await api.get<ProductionDashboardData>('/inventory/dashboard/production', { params: range })).data,
    placeholderData: keepPreviousData,
  });
  const pendingQuery = useQuery({
    queryKey: approvalRequestsKey('ProductionRun', 'Pending'),
    queryFn: () => fetchApprovalRequests('ProductionRun', 'Pending'),
    refetchInterval: 30_000,
  });

  const s = summaryQuery.data;
  const prev = prevQuery.data;
  const unit = s?.unit ?? '';
  const qty = (v: number) => `${formatQty(v)}${unit ? ` ${unit}` : ''}`;
  const kpiLoading = !s && !summaryQuery.isError;
  const conv = conversionCost(dashQuery.data?.loadedHpp);
  const hpp = dashQuery.data?.loadedHpp;

  return (
    <div className="space-y-5">
      <PeriodToolbar period={period} onPresetChange={setPreset} onRangeChange={setRange} />

      <section aria-label="Ringkasan produksi" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Proses Produksi"
          icon={Factory}
          loading={kpiLoading}
          value={s ? formatNumber(s.activeCount) : '-'}
          delta={s ? countDelta(s.activeCount, prev?.activeCount) : undefined}
          href={`/inventory?tab=production&view=data&startDate=${range.startDate}&endDate=${range.endDate}`}
        />
        <StatCard
          label="Bahan Diproses"
          icon={Boxes}
          loading={kpiLoading}
          value={s ? qty(s.inputQty) : '-'}
          hint="total input"
        />
        <StatCard
          label="Output Utama"
          icon={PackageCheck}
          loading={kpiLoading}
          value={s ? qty(mainOutputQty(s)) : '-'}
          hint="tanpa produk samping"
        />
        <StatCard
          label="Produk Samping"
          icon={Layers}
          loading={kpiLoading}
          value={s ? qty(s.byproductQty) : '-'}
          hint={s && s.outputQty > 0 ? `${formatYield((s.byproductQty / s.outputQty) * 100)} dari output` : undefined}
        />
        <StatCard
          label="Yield Tertimbang"
          icon={Percent}
          loading={kpiLoading}
          value={s ? formatYield(s.yieldPct) : '-'}
          delta={s ? pointDelta(s.yieldPct, prev?.yieldPct) : undefined}
          hint={s && !prev ? 'dibobot qty input' : undefined}
        />
        <StatCard
          label="Biaya Konversi"
          icon={Coins}
          loading={!dashQuery.data && !dashQuery.isError}
          value={conv !== null ? formatRupiah(conv, { compact: true }) : '-'}
          valueTitle={conv !== null ? formatRupiah(conv) : undefined}
          hint={
            dashQuery.isError
              ? 'gagal dimuat'
              : hpp && hpp.runsWithHppCount > 0
              ? `HPP rata-rata ${formatRupiah(hpp.avgLoadedHppPerKg)}/kg`
              : 'belum ada HPP pada periode'
          }
        />
      </section>
      {summaryQuery.isError && (
        <p role="alert" className="text-sm text-danger-text">
          Ringkasan produksi gagal dimuat.{' '}
          <button type="button" className="font-medium underline" onClick={() => summaryQuery.refetch()}>
            Coba lagi
          </button>
        </p>
      )}
      {s && !s.unit && s.inputQty > 0 && (
        <p className="text-xs text-muted-foreground">Kuantitas memakai satuan campuran; angka dijumlahkan apa adanya.</p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <YieldTrendPanel
          className="lg:col-span-2"
          query={dashQuery}
          periodYield={s?.yieldPct ?? null}
          rangeLabel={period.rangeLabel}
        />
        <PendingApprovalsPanel query={pendingQuery} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TopProductsPanel query={dashQuery} />
        <RecentRunsPanel query={dashQuery} onOpenRun={onOpenRun} />
      </div>
    </div>
  );
}

type DashQuery = ReturnType<typeof useQuery<ProductionDashboardData>>;

function YieldTrendPanel({
  query,
  periodYield,
  rangeLabel,
  className,
}: {
  query: DashQuery;
  periodYield: number | null;
  rangeLabel: string;
  className?: string;
}) {
  const rows = useMemo(() => yieldTrendRows(query.data?.yieldTrend ?? []), [query.data]);
  const domain = useMemo(() => yieldDomain(rows.map((r) => r.avgYield), periodYield), [rows, periodYield]);
  return (
    <Panel className={className} title="Tren yield harian" description={`Rata-rata yield proses per hari · ${rangeLabel}`}>
      <PanelState
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={rows.length === 0}
        emptyTitle="Belum ada data yield"
        emptyDescription="Yield tampil setelah ada proses produksi pada periode ini."
        skeleton="chart"
      >
        <figure className={cn('m-0', query.isFetching && query.isPlaceholderData && 'opacity-60')}>
          <div className="h-64" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart accessibilityLayer={false} data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
                <XAxis dataKey="label" {...CHART_AXIS} minTickGap={12} />
                <YAxis
                  {...CHART_AXIS}
                  width={48}
                  domain={domain}
                  allowDecimals={false}
                  tickCount={Math.min(6, (domain[1] - domain[0]) / 5 + 1)}
                  tickFormatter={(v: number) => `${formatNumber(v)}%`}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--border-strong)' }}
                  content={({ active, payload }) => {
                    const p = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
                    if (!p) return null;
                    return (
                      <ChartTooltipBox
                        title={formatDate(p.date, 'long')}
                        rows={[
                          { label: 'Yield rata-rata', value: formatYield(p.avgYield), color: 'var(--chart-2)' },
                          { label: 'Jumlah proses', value: formatNumber(p.count) },
                        ]}
                      />
                    );
                  }}
                />
                {periodYield !== null && (
                  <ReferenceLine
                    y={periodYield}
                    stroke="var(--chart-4)"
                    strokeDasharray="4 4"
                    label={{ value: `Tertimbang ${formatYield(periodYield)}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--text-muted)' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="avgYield"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--chart-2)', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="sr-only">
            Yield harian: {rows.map((r) => `${formatDate(r.date)} ${formatYield(r.avgYield)} (${r.count} proses)`).join('; ')}
          </figcaption>
        </figure>
      </PanelState>
    </Panel>
  );
}

function PendingApprovalsPanel({ query }: { query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchApprovalRequests>>>> }) {
  const rows = query.data ?? [];
  return (
    <Panel
      title="Menunggu persetujuan"
      description={rows.length ? `${formatQueueCount(rows.length)} pengajuan proses produksi` : 'Pengajuan proses produksi'}
      bodyClassName="p-0"
      action={
        <Link to={APPROVAL_HREF} className={linkClass}>
          Buka antrean
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      <div className="p-4 pt-3">
        <PanelState
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={rows.length === 0}
          emptyIcon={ClipboardCheck}
          emptyTitle="Tidak ada antrean"
          emptyDescription="Semua pengajuan proses produksi sudah diputuskan."
        >
          <ul className="-mx-4 -my-3 divide-y divide-border">
            {rows.slice(0, 6).map((r) => {
              const days = waitingDays(r.createdAt);
              return (
                <li key={r.id}>
                  <Link
                    to={APPROVAL_HREF}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{r.requester.fullName}</span>
                      <span className="num block text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)} · {formatQty(Number(r.amount ?? 0))} kg input
                      </span>
                    </span>
                    <StatusBadge
                      status="Pending"
                      label={days > 0 ? `${days} hari` : 'Hari ini'}
                      tone={days >= 3 ? 'danger' : 'warning'}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </PanelState>
      </div>
    </Panel>
  );
}

function TopProductsPanel({ query }: { query: DashQuery }) {
  const rows = useMemo(
    () => topProductRows(query.data?.topOutputs ?? [], query.data?.loadedHpp.perProduct ?? []),
    [query.data],
  );
  return (
    <Panel title="Produk teratas" description="Output terbesar pada periode, dengan HPP rata-rata.">
      <PanelState
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={rows.length === 0}
        emptyTitle="Belum ada output"
        emptyDescription="Hasil produksi pada periode ini akan muncul di sini."
      >
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="num mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="font-medium text-foreground">{r.name}</span>
                </span>
                <span className="num shrink-0 font-medium text-foreground">
                  {formatQty(r.quantity)} <span className="font-normal text-muted-foreground">{r.unit}</span>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted" aria-hidden>
                  <span className="block h-full rounded-sm bg-chart-2" style={{ width: `${Math.max(3, r.share * 100)}%` }} />
                </span>
                <span className="num w-32 shrink-0 text-right text-xs text-muted-foreground">
                  {r.avgHpp !== null ? `HPP ${formatRupiah(r.avgHpp)}/${r.unit || 'unit'}` : 'HPP belum ada'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </PanelState>
    </Panel>
  );
}

function RecentRunsPanel({ query, onOpenRun }: { query: DashQuery; onOpenRun: (id: string) => void }) {
  const rows = query.data?.recentProduction ?? [];
  return (
    <Panel
      title="Proses terbaru"
      description="10 proses terakhir pada periode."
      bodyClassName="p-0"
      action={
        <Link to="/inventory?tab=production&view=data" className={linkClass}>
          Data produksi
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      <div className={cn(rows.length === 0 && 'p-4')}>
        <PanelState
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={rows.length === 0}
          emptyTitle="Belum ada proses"
          emptyDescription="Tidak ada proses produksi pada periode ini."
        >
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpenRun(r.id)}
                  aria-label={`${r.runNumber}, ${formatDate(r.date)}, yield ${formatYield(r.yieldPct)}`}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="num font-mono text-xs font-medium text-primary-hover">{r.runNumber}</span>
                      <span className="num text-xs text-muted-foreground">{formatDate(r.date)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={r.outputSummary}>
                      {r.outputSummary || '-'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-sm font-semibold text-foreground">{formatYield(r.yieldPct)}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {formatQty(r.totalInput)} → {formatQty(r.totalOutput)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </PanelState>
      </div>
    </Panel>
  );
}
