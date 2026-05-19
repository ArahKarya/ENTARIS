import { useQuery } from '@tanstack/react-query';
import { Factory, TrendingUp, TrendingDown, Calculator, Loader2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../../lib/api';
import { formatRupiah } from '../../lib/formatters';
import { cn } from '../../lib/utils';

interface YieldPoint { date: string; avgYield: number; count: number; }
interface TopItem { id: string; name: string; unit: string; quantity: number; }
interface YieldRun { runNumber: string; date: string; yieldPct: number; }
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

const fmtNum = (n: number) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const fmtNumDec = (n: number) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });

export default function ProductionDeepDive({ startDate, endDate }: Props) {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ['dashboard-production-deep-dive', startDate, endDate],
    queryFn: async () => (
      await api.get('/inventory/dashboard/production', { params: { startDate, endDate } })
    ).data,
  });

  if (isLoading || !data) {
    return (
      <div className="border rounded-xl p-8 flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
        <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
      </div>
    );
  }

  const s = data.summary;
  const lh = data.loadedHpp;
  const periodDelta = s.prevPeriodRuns > 0
    ? +((s.periodRuns - s.prevPeriodRuns) / s.prevPeriodRuns * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox label="Run periode" value={s.periodRuns.toLocaleString('id-ID')}
          sub={periodDelta != null
            ? `${periodDelta >= 0 ? '+' : ''}${periodDelta}% vs periode lalu`
            : 'belum ada periode lalu'}
          icon={Factory} accent="blue" trend={periodDelta} />
        <KpiBox label="Input qty" value={`${fmtNum(s.totalInputQtyPeriod)} Kg`}
          sub="total bahan baku masuk" icon={ArrowDownToLine} accent="purple" />
        <KpiBox label="Output qty" value={`${fmtNum(s.totalOutputQtyPeriod)} Kg`}
          sub={s.totalByProductQtyPeriod > 0
            ? `+ ${fmtNum(s.totalByProductQtyPeriod)} Kg byproduct`
            : 'tanpa byproduct'}
          icon={ArrowUpFromLine} accent="emerald" />
        <KpiBox label="Avg yield periode" value={`${s.avgYieldPeriod.toFixed(1)}%`}
          sub={`historis: ${s.avgYield.toFixed(1)}%`} icon={TrendingUp}
          accent={s.avgYieldPeriod >= 50 ? 'emerald' : 'amber'} />
      </div>

      {/* Yield trend chart */}
      <div className="border rounded-xl p-5"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Tren Yield Periode
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Rata-rata yield per hari produksi
            </p>
          </div>
        </div>
        {data.yieldTrend.length === 0 ? (
          <div className="py-8 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Belum ada run dengan yield pada periode ini.
          </div>
        ) : (
          <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.yieldTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" fontSize={10}
                  tickFormatter={(d) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} />
                <YAxis fontSize={10} unit="%" />
                <Tooltip
                  formatter={(value: any) => `${Number(value).toFixed(2)}%`}
                  labelFormatter={(d) => new Date(d).toLocaleDateString('id-ID')}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="avgYield" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top inputs vs outputs + best/worst yields */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TopItemList title="Top Input" hint="Bahan baku terbanyak periode"
          items={data.topInputs} accent="blue" />
        <TopItemList title="Top Output" hint="Produk terbanyak periode"
          items={data.topOutputs} accent="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <YieldRankList title="Best Yield" runs={data.bestYield} type="best" />
        <YieldRankList title="Worst Yield" runs={data.worstYield} type="worst" />
      </div>

      {/* Loaded HPP breakdown */}
      {lh.runsWithHppCount > 0 && (
        <div className="border-2 border-emerald-200 dark:border-emerald-800 rounded-xl p-5 bg-emerald-50/30 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-emerald-900 dark:text-emerald-100">
                <Calculator size={14} /> Loaded HPP Breakdown
              </h3>
              <p className="text-xs mt-0.5 text-emerald-700 dark:text-emerald-300">
                {lh.runsWithHppCount} run dengan computed HPP pada periode
              </p>
            </div>
          </div>

          {/* Components breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
            <BreakdownCell label="Material" value={lh.totalMaterialCost} />
            <BreakdownCell label="Biaya Input" value={lh.totalCostInputSide} sign="+" />
            <BreakdownCell label="Biaya Output" value={lh.totalCostOutputSide} sign="+" />
            <BreakdownCell label="Byproduct (NRV)" value={lh.totalByproductValue} sign="−" />
            <BreakdownCell label="Net HPP" value={lh.totalLoadedHpp} bold accent="emerald" />
          </div>

          {/* Per-product list */}
          {lh.perProduct.length > 0 && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 overflow-hidden bg-white dark:bg-gray-900/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-emerald-50/60 dark:bg-emerald-900/30 border-b border-emerald-200 dark:border-emerald-800">
                    <th className="text-left py-1.5 px-2 text-[10px] uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                      Produk Utama
                    </th>
                    <th className="text-right py-1.5 px-2 text-[10px] uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                      Qty Output
                    </th>
                    <th className="text-right py-1.5 px-2 text-[10px] uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                      Avg HPP/Kg
                    </th>
                    <th className="text-right py-1.5 px-2 text-[10px] uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                      HPP Terakhir
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lh.perProduct.map((p) => (
                    <tr key={p.itemId} className="border-b last:border-b-0 border-emerald-100 dark:border-emerald-900">
                      <td className="py-1.5 px-2">
                        <p className="font-medium text-[11px]" style={{ color: 'var(--color-text-primary)' }}>
                          {p.itemName}
                        </p>
                        <p className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                          {p.itemCode} · {p.runs} run
                        </p>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums"
                        style={{ color: 'var(--color-text-secondary)' }}>
                        {fmtNum(p.totalQty)} {p.unit}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                        Rp {fmtNumDec(p.avgComputedHpp)}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums"
                        style={{ color: 'var(--color-text-secondary)' }}>
                        Rp {fmtNumDec(p.latestComputedHpp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface KpiBoxProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent: 'blue' | 'emerald' | 'purple' | 'amber';
  trend?: number | null;
}
function KpiBox({ icon: Icon, label, value, sub, accent, trend }: KpiBoxProps) {
  const accentBg = {
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600',
    purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600',
  }[accent];
  return (
    <div className="border rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accentBg}`}>
          <Icon size={15} />
        </div>
        {trend != null && trend !== 0 && (
          <span className={cn('text-[10px] font-semibold flex items-center gap-0.5',
            trend > 0 ? 'text-green-600' : 'text-red-600')}>
            {trend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
        {value}
      </p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}

interface TopItemListProps {
  title: string;
  hint: string;
  items: TopItem[];
  accent: 'blue' | 'emerald';
}
function TopItemList({ title, hint, items, accent }: TopItemListProps) {
  const accentIcon = accent === 'blue' ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />;
  const accentBg = accent === 'blue'
    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'
    : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600';
  const maxQty = items.length > 0 ? Math.max(...items.map((i) => i.quantity)) : 1;
  return (
    <div className="border rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>
        </div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentBg}`}>
          {accentIcon}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="py-4 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Belum ada data
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs truncate pr-2" style={{ color: 'var(--color-text-primary)' }}>
                  {it.name}
                </span>
                <span className="text-xs tabular-nums font-medium flex-shrink-0"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  {fmtNum(it.quantity)} {it.unit}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                <div className={cn('h-full rounded-full',
                  accent === 'blue' ? 'bg-blue-500' : 'bg-emerald-500')}
                  style={{ width: `${(it.quantity / maxQty) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface YieldRankListProps {
  title: string;
  runs: YieldRun[];
  type: 'best' | 'worst';
}
function YieldRankList({ title, runs, type }: YieldRankListProps) {
  return (
    <div className="border rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center gap-2 mb-3">
        {type === 'best'
          ? <TrendingUp size={14} className="text-green-600" />
          : <TrendingDown size={14} className="text-red-500" />}
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
      </div>
      {runs.length === 0 ? (
        <p className="text-xs text-center py-3" style={{ color: 'var(--color-text-muted)' }}>
          Belum ada run dengan yield
        </p>
      ) : (
        <div className="space-y-1.5">
          {runs.slice(0, 5).map((r) => (
            <div key={r.runNumber} className="flex items-center justify-between py-1">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {r.runNumber}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
                </p>
              </div>
              <span className={cn('text-xs font-bold tabular-nums',
                type === 'best' ? 'text-green-600' : 'text-red-500')}>
                {r.yieldPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BreakdownCellProps {
  label: string;
  value: number;
  sign?: '+' | '−';
  bold?: boolean;
  accent?: 'emerald';
}
function BreakdownCell({ label, value, sign, bold, accent }: BreakdownCellProps) {
  return (
    <div className={cn('rounded-lg px-2.5 py-2 border',
      accent === 'emerald'
        ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700'
        : 'bg-white dark:bg-gray-900/40 border-emerald-200 dark:border-emerald-800')}>
      <p className="text-[10px] text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">{label}</p>
      <p className={cn('mt-0.5 tabular-nums',
        bold ? 'text-sm font-bold text-emerald-900 dark:text-emerald-100' : 'text-xs font-semibold',
        !bold && 'text-gray-700 dark:text-gray-300')}>
        {sign && <span className="text-emerald-600 mr-0.5">{sign}</span>}
        {formatRupiah(value)}
      </p>
    </div>
  );
}
