import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Calculator, Factory, TrendingDown, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../../lib/api';
import { formatNumber, formatRupiah, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatCard, type StatDelta } from '../shared/stat-card';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ChartFrame } from '../dashboard-kit/ChartFrame';
import { MiniTable } from '../dashboard-kit/MiniTable';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from '../dashboard-kit/chart-theme';

interface YieldPoint { date: string; avgYield: number; count: number }
interface TopItem { id: string; name: string; unit: string; quantity: number }
interface YieldRun { runNumber: string; date: string; yieldPct: number }
interface PerProduct {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  runs: number;
  totalQty: number;
  avgComputedHpp: number;
  latestComputedHpp: number;
}

interface ApiResponse {
  summary: {
    totalRuns: number;
    periodRuns: number;
    prevPeriodRuns: number;
    avgYield: number;
    avgYieldPeriod: number;
    totalInputQtyPeriod: number;
    totalOutputQtyPeriod: number;
    totalByProductQtyPeriod: number;
  };
  yieldTrend: YieldPoint[];
  topInputs: TopItem[];
  topOutputs: TopItem[];
  bestYield: YieldRun[];
  worstYield: YieldRun[];
  loadedHpp: {
    perProduct: PerProduct[];
    totalMaterialCost: number;
    totalCostInputSide: number;
    totalCostOutputSide: number;
    totalByproductValue: number;
    totalLoadedHpp: number;
    avgLoadedHppPerKg: number;
    runsWithHppCount: number;
  };
}

interface Props {
  startDate: string;
  endDate: string;
}

const fmtShortDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });

function TopItemList({ title, hint, items, icon, tone }: { title: string; hint: string; items: TopItem[]; icon: typeof Factory; tone: string }) {
  const max = items.length > 0 ? Math.max(...items.map((i) => i.quantity)) : 1;
  return (
    <WidgetCard title={title} description={hint} icon={icon} isEmpty={items.length === 0} emptyText="Belum ada data" minHeight={90}>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-foreground">{it.name}</span>
              <span className="num shrink-0 text-xs font-medium text-muted-foreground">{formatNumber(it.quantity)} {it.unit}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn('h-full rounded-full', tone)} style={{ width: `${(it.quantity / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

function YieldRankList({ title, runs, best }: { title: string; runs: YieldRun[]; best: boolean }) {
  return (
    <WidgetCard title={title} icon={best ? TrendingUp : TrendingDown} isEmpty={runs.length === 0} emptyText="Belum ada run dengan yield" minHeight={90}>
      <ul className="divide-y divide-border">
        {runs.slice(0, 5).map((r) => (
          <li key={r.runNumber} className="flex items-center justify-between py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs text-foreground">{r.runNumber}</p>
              <p className="text-[11px] text-muted-foreground">{formatDate(r.date, 'short')}</p>
            </div>
            <span className={cn('num text-xs font-semibold', best ? 'text-success-text' : 'text-danger-text')}>{r.yieldPct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

export default function ProductionDeepDive({ startDate, endDate }: Props) {
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-production-deep-dive', startDate, endDate],
    queryFn: async () => (await api.get('/inventory/dashboard/production', { params: { startDate, endDate } })).data,
  });

  if (isLoading || isError || !data) {
    return <WidgetCard title="Produksi pada Periode" icon={Factory} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} minHeight={420} />;
  }

  const s = data.summary;
  const lh = data.loadedHpp;
  const periodDelta = s.prevPeriodRuns > 0 ? +(((s.periodRuns - s.prevPeriodRuns) / s.prevPeriodRuns) * 100).toFixed(1) : null;
  const runDelta: StatDelta | undefined =
    periodDelta === null
      ? undefined
      : { value: `${periodDelta >= 0 ? '+' : ''}${periodDelta}%`, direction: periodDelta > 0 ? 'up' : periodDelta < 0 ? 'down' : 'flat', label: 'vs periode lalu' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Run periode" value={formatNumber(s.periodRuns)} icon={Factory} delta={runDelta} hint={periodDelta === null ? 'belum ada periode lalu' : undefined} />
        <StatCard label="Input qty" value={`${formatNumber(s.totalInputQtyPeriod)} Kg`} icon={ArrowDownToLine} hint="total bahan baku masuk" />
        <StatCard
          label="Output qty"
          value={`${formatNumber(s.totalOutputQtyPeriod)} Kg`}
          icon={ArrowUpFromLine}
          hint={s.totalByProductQtyPeriod > 0 ? `+ ${formatNumber(s.totalByProductQtyPeriod)} Kg byproduct` : 'tanpa byproduct'}
        />
        <StatCard label="Rata-rata yield periode" value={`${s.avgYieldPeriod.toFixed(1)}%`} icon={TrendingUp} hint={`historis ${s.avgYield.toFixed(1)}%`} />
      </div>

      <WidgetCard
        title="Tren Yield Periode"
        description="Rata-rata yield per hari produksi"
        icon={TrendingUp}
        isEmpty={data.yieldTrend.length === 0}
        emptyText="Belum ada run dengan yield pada periode ini."
        minHeight={200}
      >
        <ChartFrame
          height={200}
          summary={`Grafik garis yield produksi per hari, ${data.yieldTrend.length} titik. Rata-rata periode ${s.avgYieldPeriod.toFixed(1)} persen.`}
          table={{
            caption: 'Yield produksi per hari',
            columns: ['Tanggal', 'Yield (%)', 'Jumlah run'],
            rows: data.yieldTrend.map((p) => [fmtShortDate(p.date), p.avgYield.toFixed(2), String(p.count)]),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.yieldTrend} margin={{ top: 5, right: 10, left: -12, bottom: 5 }} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={fmtShortDate} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} unit="%" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${Number(v).toFixed(2)}%`} labelFormatter={(d) => formatDate(String(d))} />
              <Line type="monotone" dataKey="avgYield" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3, fill: 'var(--chart-2)' }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </WidgetCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopItemList title="Top Input" hint="Bahan baku terbanyak periode" items={data.topInputs} icon={ArrowDownToLine} tone="bg-chart-2" />
        <TopItemList title="Top Output" hint="Produk terbanyak periode" items={data.topOutputs} icon={ArrowUpFromLine} tone="bg-chart-3" />
        <YieldRankList title="Yield Terbaik" runs={data.bestYield} best />
        <YieldRankList title="Yield Terendah" runs={data.worstYield} best={false} />
      </div>

      {lh.runsWithHppCount > 0 && (
        <WidgetCard title="Rincian Loaded HPP" description={`${lh.runsWithHppCount} run dengan HPP terhitung pada periode`} icon={Calculator}>
          <dl className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
            {[
              ['Material', lh.totalMaterialCost, ''],
              ['Biaya Input', lh.totalCostInputSide, '+ '],
              ['Biaya Output', lh.totalCostOutputSide, '+ '],
              ['Byproduct (NRV)', lh.totalByproductValue, '- '],
              ['Net HPP', lh.totalLoadedHpp, '= '],
            ].map(([k, v, sign]) => (
              <div key={k as string} className={cn('rounded-md border px-2.5 py-2', k === 'Net HPP' ? 'border-border-strong bg-muted' : 'border-border')}>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className={cn('num mt-0.5 text-xs text-foreground', k === 'Net HPP' ? 'text-sm font-semibold' : 'font-medium')}>
                  {sign}
                  {formatRupiah(v as number)}
                </dd>
              </div>
            ))}
          </dl>
          {lh.perProduct.length > 0 && (
            <MiniTable
              caption="HPP per produk utama"
              rows={lh.perProduct}
              rowKey={(p) => p.itemId}
              columns={[
                { key: 'name', label: 'Produk Utama' },
                { key: 'qty', label: 'Qty Output', numeric: true },
                { key: 'avg', label: 'Rata-rata HPP/Kg', numeric: true },
                { key: 'last', label: 'HPP Terakhir', numeric: true, hideOnMobile: true },
              ]}
              cell={(p, k) => {
                switch (k) {
                  case 'name':
                    return (
                      <div>
                        <p className="font-medium">{p.itemName}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{p.itemCode} - {p.runs} run</p>
                      </div>
                    );
                  case 'qty':
                    return `${formatNumber(p.totalQty)} ${p.unit}`;
                  case 'avg':
                    return <span className="font-semibold">{formatRupiah(p.avgComputedHpp, { decimals: 2 })}</span>;
                  default:
                    return formatRupiah(p.latestComputedHpp, { decimals: 2 });
                }
              }}
            />
          )}
        </WidgetCard>
      )}
    </div>
  );
}
