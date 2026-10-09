/**
 * Inventory dashboard. Every figure is aggregated server-side over all active
 * items, never summed in the browser. Period and value grouping live in the URL.
 */
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  History,
  PackageSearch,
  PackageX,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '@/lib/api';
import { formatDate, formatNumber, formatPercent, formatRupiah, toNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DataTable, RowActions, StatCard, StatusBadge, type Paginated } from '@/components/shared';
import { CHART_AXIS, CHART_GRID_STROKE, useDashboardPeriod } from '@/components/inventory/dashboard-hooks';
import {
  ChartTooltipBox,
  Panel,
  PanelState,
  PeriodToolbar,
  SegmentedToggle,
} from '@/components/inventory/dashboard-kit';
import { attentionRows, countDelta, previousPeriod, stockCoverage } from '@/components/inventory/dashboard-model';
import {
  formatQty,
  isInbound,
  itemStockStatus,
  movementTypeLabel,
  type InventoryItemRow,
  type InventoryItemSummary,
  type StockMovementRow,
  type StockMovementSummary,
} from '@/components/inventory/inventory-rows';

type ValueBy = 'category' | 'warehouse';
const VALUE_BY_PARAM = 'valueBy';
const VALUE_BY_OPTIONS: ReadonlyArray<{ value: ValueBy; label: string }> = [
  { value: 'category', label: 'Kategori' },
  { value: 'warehouse', label: 'Gudang' },
];
const ATTENTION_LIMIT = 8;
const OTHER_GROUP_KEY = '__other__';

interface StockValueBreakdown {
  groupBy: ValueBy;
  total: number;
  groups: Array<{ key: string; label: string; itemCount: number; value: number; share: number }>;
}

const inv = (params: Record<string, string>) => `/inventory?${new URLSearchParams(params).toString()}`;
const itemsLink = (params: Record<string, string>) => inv({ tab: 'items', ...params });
const movementsLink = (params: Record<string, string>) => inv({ tab: 'movements', ...params });

function useMovementSummary(range: { startDate: string; endDate: string }) {
  return useQuery({
    queryKey: ['stock-movements', 'summary', range],
    queryFn: async () => (await api.get<StockMovementSummary>('/inventory/movements/summary', { params: range })).data,
    placeholderData: keepPreviousData,
  });
}

function useAttentionItems(stockStatus: 'out' | 'low') {
  return useQuery({
    queryKey: ['inventory-items', 'list', { dashboard: stockStatus }],
    queryFn: async () =>
      (
        await api.get<Paginated<InventoryItemRow>>('/inventory/items', {
          params: {
            isActive: 'true',
            stockStatus,
            sort: stockStatus === 'out' ? 'name' : 'currentStock',
            limit: ATTENTION_LIMIT,
          },
        })
      ).data,
  });
}

export default function InventoryDashboardTab() {
  const { period, setPreset, setRange } = useDashboardPeriod();
  const [searchParams, setSearchParams] = useSearchParams();
  const valueBy: ValueBy = searchParams.get(VALUE_BY_PARAM) === 'warehouse' ? 'warehouse' : 'category';
  const range = useMemo(() => ({ startDate: period.startDate, endDate: period.endDate }), [period.startDate, period.endDate]);
  const prevRange = useMemo(() => previousPeriod(range), [range]);

  const summaryQuery = useQuery({
    queryKey: ['inventory-items', 'summary', { isActive: 'true' }],
    queryFn: async () =>
      (await api.get<InventoryItemSummary>('/inventory/items/summary', { params: { isActive: 'true' } })).data,
  });
  const movementQuery = useMovementSummary(range);
  const prevMovementQuery = useMovementSummary(prevRange);
  const outQuery = useAttentionItems('out');
  const lowQuery = useAttentionItems('low');
  const valueQuery = useQuery({
    queryKey: ['inventory-dashboard', 'stock-value', valueBy],
    queryFn: async () =>
      (await api.get<StockValueBreakdown>('/inventory/dashboard/stock-value', { params: { groupBy: valueBy } })).data,
    placeholderData: keepPreviousData,
  });
  const recentQuery = useQuery({
    queryKey: ['stock-movements', 'list', { dashboard: true, ...range }],
    queryFn: async () =>
      (
        await api.get<Paginated<StockMovementRow>>('/inventory/movements', {
          params: { ...range, status: 'active', sort: '-date', limit: 8 },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const summary = summaryQuery.data;
  const moves = movementQuery.data;
  const prevMoves = prevMovementQuery.data;
  const movementCount = moves ? moves.count - moves.cancelledCount : null;
  const prevMovementCount = prevMoves ? prevMoves.count - prevMoves.cancelledCount : null;
  const kpiLoading = !summary && !summaryQuery.isError;
  const periodLinkParams = { startDate: range.startDate, endDate: range.endDate };

  const setValueBy = (next: ValueBy) =>
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'category') p.delete(VALUE_BY_PARAM);
      else p.set(VALUE_BY_PARAM, next);
      return p;
    });

  return (
    <div className="space-y-5">
      <PeriodToolbar period={period} onPresetChange={setPreset} onRangeChange={setRange} />

      <section aria-label="Ringkasan persediaan" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          className="col-span-2 lg:col-span-1"
          label="Nilai Persediaan"
          icon={Wallet}
          loading={kpiLoading}
          value={summary ? formatRupiah(summary.stockValue, { compact: true }) : '-'}
          valueTitle={summary ? formatRupiah(summary.stockValue) : undefined}
          hint="stok × harga rata-rata, item aktif"
        />
        <StatCard
          label="Item Aktif"
          icon={Boxes}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.count) : '-'}
          hint="item persediaan"
          href={itemsLink({ isActive: 'true' })}
        />
        <StatCard
          label="Stok Habis"
          icon={PackageX}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.outCount) : '-'}
          hint="stok nol atau minus"
          href={itemsLink({ isActive: 'true', stockStatus: 'out' })}
        />
        <StatCard
          label="Di Bawah Minimum"
          icon={AlertTriangle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.lowCount) : '-'}
          hint="perlu dipesan ulang"
          href={itemsLink({ isActive: 'true', stockStatus: 'low' })}
        />
        <StatCard
          label="Gerakan Stok"
          icon={ArrowLeftRight}
          loading={!moves && !movementQuery.isError}
          value={movementCount !== null ? formatNumber(movementCount) : '-'}
          delta={movementCount !== null ? countDelta(movementCount, prevMovementCount) : undefined}
          hint={moves ? `${formatNumber(moves.inCount)} masuk · ${formatNumber(moves.outCount)} keluar` : period.label}
          href={movementsLink(periodLinkParams)}
        />
      </section>
      {summaryQuery.isError && (
        <p role="alert" className="text-sm text-danger-text">
          Ringkasan persediaan gagal dimuat.{' '}
          <button type="button" className="font-medium underline" onClick={() => summaryQuery.refetch()}>
            Coba lagi
          </button>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <AttentionPanel
          className="lg:col-span-3"
          outQuery={outQuery}
          lowQuery={lowQuery}
          outCount={summary?.outCount}
          lowCount={summary?.lowCount}
        />
        <StockValuePanel
          className="lg:col-span-2"
          valueBy={valueBy}
          onValueByChange={setValueBy}
          query={valueQuery}
        />
      </div>

      <RecentMovementsPanel
        rangeLabel={`${period.label} · ${period.rangeLabel}`}
        query={recentQuery}
        allHref={movementsLink(periodLinkParams)}
      />
    </div>
  );
}

// Perlu tindakan

type ItemsQuery = ReturnType<typeof useAttentionItems>;

function AttentionPanel({
  outQuery,
  lowQuery,
  outCount,
  lowCount,
  className,
}: {
  outQuery: ItemsQuery;
  lowQuery: ItemsQuery;
  outCount?: number;
  lowCount?: number;
  className?: string;
}) {
  const rows = useMemo(
    () => attentionRows(outQuery.data?.data ?? [], lowQuery.data?.data ?? [], ATTENTION_LIMIT),
    [outQuery.data, lowQuery.data],
  );
  const total = (outQuery.data?.total ?? 0) + (lowQuery.data?.total ?? 0);
  const loading = (outQuery.isLoading || lowQuery.isLoading) && rows.length === 0;
  const error = outQuery.error ?? lowQuery.error;
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<InventoryItemRow>[]>(
    () => [
      {
        id: 'item',
        header: 'Item',
        meta: { cellClassName: 'min-w-36 max-w-72' },
        cell: ({ row }) => {
          const i = row.original;
          return (
            <div className="min-w-0">
              <Link
                to={itemsLink({ q: i.code })}
                className="line-clamp-2 rounded-sm font-medium text-foreground underline-offset-2 hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {i.name}
              </Link>
              <p className="num font-mono text-xs text-muted-foreground">{i.code}</p>
            </div>
          );
        },
      },
      {
        id: 'stock',
        header: 'Stok / Min.',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const i = row.original;
          const coverage = stockCoverage(i.currentStock, i.minimumStock);
          const out = itemStockStatus(i) === 'out';
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={cn('font-semibold', out ? 'text-danger-text' : 'text-warning-text')}>
                {formatQty(i.currentStock)}
                <span className="font-normal text-muted-foreground">
                  {' '}
                  / {toNumber(i.minimumStock) ? formatQty(i.minimumStock) : '-'} {i.unit}
                </span>
              </span>
              {coverage !== null && (
                <span
                  className="block h-1 w-20 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${formatPercent(Math.min(coverage, 1), { decimals: 0 })} dari stok minimum`}
                >
                  <span
                    className={cn('block h-full rounded-full', out ? 'bg-danger' : 'bg-warning')}
                    style={{ width: `${Math.max(4, Math.min(coverage, 1) * 100)}%` }}
                  />
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={itemStockStatus(row.original)} docType="inventory_item" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const i = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${i.code}`}
              actions={[
                {
                  label: 'Lihat item',
                  icon: PackageSearch,
                  onSelect: () => navigate(itemsLink({ q: i.code })),
                },
                {
                  label: 'Riwayat gerakan',
                  icon: History,
                  onSelect: () => navigate(movementsLink({ itemId: i.id })),
                },
              ]}
            />
          );
        },
      },
    ],
    [navigate],
  );

  return (
    <Panel
      className={className}
      title="Perlu tindakan"
      description="Item aktif yang stoknya habis atau di bawah minimum."
      bodyClassName="p-0"
      action={
        total > 0 ? (
          <Link
            to={itemsLink({ isActive: 'true', stockStatus: (outCount ?? 0) > 0 ? 'out' : 'low' })}
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Lihat semua ({formatNumber((outCount ?? 0) + (lowCount ?? 0) || total)})
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : undefined
      }
    >
      {!loading && !error && rows.length === 0 ? (
        <div role="status" className="flex items-center gap-3 px-4 py-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-text">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">Semua stok aman</p>
            <p className="text-xs text-muted-foreground">Tidak ada item aktif yang habis atau di bawah minimum.</p>
          </div>
        </div>
      ) : (
        <DataTable
          label="Item yang perlu tindakan"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={() => {
            outQuery.refetch();
            lowQuery.refetch();
          }}
          stickyHeader={false}
          pageSize={ATTENTION_LIMIT}
          className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none"
        />
      )}
    </Panel>
  );
}

// Nilai stok

function StockValuePanel({
  valueBy,
  onValueByChange,
  query,
  className,
}: {
  valueBy: ValueBy;
  onValueByChange: (v: ValueBy) => void;
  query: ReturnType<typeof useQuery<StockValueBreakdown>>;
  className?: string;
}) {
  const data = query.data;
  const groups = data?.groups ?? [];
  const chartHeight = Math.max(160, groups.length * 36 + 24);

  return (
    <Panel
      className={className}
      title={`Nilai stok per ${valueBy === 'category' ? 'kategori' : 'gudang'}`}
      description={
        data
          ? `Total ${formatRupiah(data.total)}${valueBy === 'warehouse' ? ' · saldo per gudang' : ''}`
          : 'Stok × harga rata-rata, item aktif.'
      }
      action={<SegmentedToggle label="Kelompokkan nilai stok" value={valueBy} options={VALUE_BY_OPTIONS} onChange={onValueByChange} />}
    >
      <PanelState
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={groups.length === 0}
        emptyTitle="Belum ada nilai stok"
        emptyDescription="Nilai muncul setelah item memiliki stok dan harga rata-rata."
        skeleton="chart"
      >
        <figure className={cn('m-0', query.isFetching && query.isPlaceholderData && 'opacity-60')}>
          <div style={{ height: chartHeight }} aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart accessibilityLayer={false} data={groups} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  {...CHART_AXIS}
                  tickFormatter={(v: number) => formatRupiah(v, { compact: true, symbol: false })}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  {...CHART_AXIS}
                  width={104}
                  tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                />
                <Tooltip
                  cursor={{ fill: 'var(--accent)' }}
                  content={({ active, payload }) => {
                    const g = active ? (payload?.[0]?.payload as StockValueBreakdown['groups'][number] | undefined) : undefined;
                    if (!g) return null;
                    return (
                      <ChartTooltipBox
                        title={g.label}
                        rows={[
                          { label: 'Nilai', value: formatRupiah(g.value) },
                          { label: 'Porsi', value: formatPercent(g.share) },
                          { label: 'Item berstok', value: formatNumber(g.itemCount) },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {groups.map((g) => (
                    <Cell key={g.key} fill={g.key === OTHER_GROUP_KEY ? 'var(--chart-6)' : 'var(--chart-2)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="sr-only">
            Nilai stok per {valueBy === 'category' ? 'kategori' : 'gudang'}:{' '}
            {groups.map((g) => `${g.label} ${formatRupiah(g.value)} (${formatPercent(g.share)})`).join('; ')}
          </figcaption>
        </figure>
      </PanelState>
    </Panel>
  );
}

// Gerakan terbaru

function RecentMovementsPanel({
  rangeLabel,
  query,
  allHref,
}: {
  rangeLabel: string;
  query: ReturnType<typeof useQuery<Paginated<StockMovementRow>>>;
  allHref: string;
}) {
  const columns = useMemo<ColumnDef<StockMovementRow>[]>(
    () => [
      {
        id: 'date',
        header: 'Tanggal',
        meta: { hideBelow: 'sm', cellClassName: 'whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => <span className="num">{formatDate(row.original.date)}</span>,
      },
      {
        id: 'number',
        header: 'No. Gerakan',
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const m = row.original;
          return m.movementNumber ? (
            <Link
              to={movementsLink({ q: m.movementNumber })}
              className="num rounded-sm font-mono text-xs font-medium text-primary-hover underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {m.movementNumber}
            </Link>
          ) : (
            '-'
          );
        },
      },
      {
        id: 'item',
        header: 'Item',
        meta: { cellClassName: 'min-w-32 max-w-72' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="min-w-0">
              {m.item ? (
                <Link
                  to={movementsLink({ itemId: m.item.id })}
                  className="line-clamp-1 rounded-sm font-medium text-foreground underline-offset-2 hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Riwayat gerakan item"
                >
                  {m.item.name}
                </Link>
              ) : (
                '-'
              )}
              <p className="num text-xs text-muted-foreground sm:hidden">{formatDate(m.date, 'short')}</p>
            </div>
          );
        },
      },
      {
        id: 'type',
        header: 'Tipe',
        meta: { hideBelow: 'sm', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const inbound = isInbound(row.original.movementType);
          const Icon = inbound ? ArrowDownLeft : ArrowUpRight;
          return (
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium', inbound ? 'text-success-text' : 'text-danger-text')}>
              <Icon className="size-3.5" aria-hidden />
              {movementTypeLabel(row.original.movementType)}
            </span>
          );
        },
      },
      {
        id: 'quantity',
        header: 'Kuantitas',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const m = row.original;
          const inbound = isInbound(m.movementType);
          return (
            <span className={cn('font-medium', inbound ? 'text-success-text' : 'text-foreground')}>
              {inbound ? '+' : '−'}
              {formatQty(m.quantity)} <span className="font-normal text-muted-foreground">{m.item?.unit}</span>
            </span>
          );
        },
      },
      {
        id: 'value',
        header: 'Nilai',
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => (row.original.totalValue != null ? formatRupiah(row.original.totalValue) : '-'),
      },
    ],
    [],
  );

  return (
    <Panel
      title="Gerakan stok terbaru"
      description={rangeLabel}
      bodyClassName="p-0"
      action={
        <Link
          to={allHref}
          className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Semua gerakan
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      <DataTable
        label="Gerakan stok terbaru"
        columns={columns}
        data={query.data?.data}
        getRowId={(r) => r.id}
        loading={query.isLoading}
        fetching={query.isFetching && query.isPlaceholderData}
        error={query.error}
        onRetry={() => query.refetch()}
        stickyHeader={false}
        pageSize={8}
        empty={{ title: 'Belum ada gerakan', description: 'Tidak ada gerakan stok pada periode ini.' }}
        className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none"
      />
    </Panel>
  );
}
