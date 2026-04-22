import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Factory, TrendingUp, TrendingDown, Package, ArrowDown, ArrowUp, BarChart3, Clock, Filter } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatDate } from '../lib/formatters';

const fmtNum = (val: number, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const thisMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayStr = () => new Date().toISOString().split('T')[0];

interface DashboardData {
  summary: {
    totalRuns: number;
    periodRuns: number;
    prevPeriodRuns: number;
    avgRendemen: number;
    avgRendemenPeriod: number;
    totalInputQtyPeriod: number;
    totalOutputQtyPeriod: number;
    totalByProductQtyPeriod: number;
  };
  rendemenTrend: { date: string; avgRendemen: number; count: number }[];
  topInputs: { id: string; name: string; unit: string; quantity: number }[];
  topOutputs: { id: string; name: string; unit: string; quantity: number }[];
  bestRendemen: { runNumber: string; date: string; rendemenPct: number }[];
  worstRendemen: { runNumber: string; date: string; rendemenPct: number }[];
  recentProduction: {
    id: string; runNumber: string; date: string; rendemenPct: number | null;
    referenceNumber: string | null; totalInput: number; totalOutput: number;
    inputSummary: string; outputSummary: string;
  }[];
}

interface Props {
  items?: any[];
}

export default function ProductionDashboardTab({ items = [] }: Props) {
  const [startDate, setStartDate] = useState(thisMonthStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [itemId, setItemId] = useState('');

  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (itemId) params.itemId = itemId;

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['production-dashboard', params],
    queryFn: () => api.get('/inventory/dashboard/production', { params }).then(r => r.data),
  });

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 self-center">
            <Filter size={13} /> Filter
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Dari</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg py-1.5 px-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Sampai</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg py-1.5 px-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Produk</label>
            <select
              value={itemId}
              onChange={e => setItemId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Produk</option>
              {items.filter((i: any) => i.isActive !== false).map((i: any) => (
                <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
              ))}
            </select>
          </div>
          {(startDate !== thisMonthStr() || endDate !== todayStr() || itemId) && (
            <button
              type="button"
              onClick={() => { setStartDate(thisMonthStr()); setEndDate(todayStr()); setItemId(''); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium py-1.5"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data ? null : (
        <DashboardContent data={data} />
      )}
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  const { summary } = data;
  const periodDelta = summary.periodRuns - summary.prevPeriodRuns;
  const rendemenPeriod = summary.totalInputQtyPeriod > 0
    ? (summary.totalOutputQtyPeriod / summary.totalInputQtyPeriod * 100)
    : 0;

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={<Factory size={16} />}
          label="Total Produksi"
          value={fmtNum(summary.totalRuns)}
          color="blue"
        />
        <KPICard
          icon={<Package size={16} />}
          label="Periode Ini"
          value={fmtNum(summary.periodRuns)}
          sub={periodDelta !== 0 ? (
            <span className={cn('text-xs font-medium flex items-center gap-0.5',
              periodDelta > 0 ? 'text-green-600' : 'text-red-500')}>
              {periodDelta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
              {Math.abs(periodDelta)} vs periode sebelumnya
            </span>
          ) : undefined}
          color="green"
        />
        <KPICard
          icon={<BarChart3 size={16} />}
          label="Yield Keseluruhan"
          value={`${summary.avgRendemen.toFixed(1)}%`}
          color="purple"
        />
        <KPICard
          icon={<TrendingUp size={16} />}
          label="Yield Periode"
          value={`${summary.avgRendemenPeriod.toFixed(1)}%`}
          color="amber"
        />
      </div>

      {/* Volume summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Total Input</p>
          <p className="text-xl font-bold text-blue-700 mt-1 tabular-nums">
            {fmtNum(summary.totalInputQtyPeriod, 1)} <span className="text-sm font-normal">Kg</span>
          </p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-green-500 uppercase tracking-wide">Total Output</p>
          <p className="text-xl font-bold text-green-700 mt-1 tabular-nums">
            {fmtNum(summary.totalOutputQtyPeriod, 1)} <span className="text-sm font-normal">Kg</span>
          </p>
          {rendemenPeriod > 0 && (
            <p className="text-xs text-green-600 mt-0.5">Yield: {rendemenPeriod.toFixed(1)}%</p>
          )}
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide">Produk Samping</p>
          <p className="text-xl font-bold text-amber-700 mt-1 tabular-nums">
            {fmtNum(summary.totalByProductQtyPeriod, 1)} <span className="text-sm font-normal">Kg</span>
          </p>
        </div>
      </div>

      {/* Rendemen Trend Chart */}
      {data.rendemenTrend.length > 0 && <RendemenTrendChart trend={data.rendemenTrend} />}

      {/* Top Inputs & Outputs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankList
          title="Top Bahan Input"
          icon={<ArrowDown size={14} className="text-blue-500" />}
          items={data.topInputs}
          color="blue"
        />
        <RankList
          title="Top Hasil Output"
          icon={<ArrowUp size={14} className="text-green-500" />}
          items={data.topOutputs}
          color="green"
        />
      </div>

      {/* Best & Worst Rendemen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RendemenList
          title="Yield Tertinggi"
          icon={<TrendingUp size={14} className="text-green-500" />}
          items={data.bestRendemen}
          color="green"
        />
        <RendemenList
          title="Yield Terendah"
          icon={<TrendingDown size={14} className="text-red-500" />}
          items={data.worstRendemen}
          color="red"
        />
      </div>

      {/* Recent Production */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Produksi Terakhir</h3>
        </div>
        {data.recentProduction.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Tidak ada data produksi di periode ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Tanggal</th>
                  <th className="text-left px-4 py-2.5 font-medium">No. Produksi</th>
                  <th className="text-left px-4 py-2.5 font-medium">Input</th>
                  <th className="text-left px-4 py-2.5 font-medium">Output</th>
                  <th className="text-right px-4 py-2.5 font-medium">Yield</th>
                </tr>
              </thead>
              <tbody>
                {data.recentProduction.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                        {r.runNumber}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[200px] truncate" title={r.inputSummary}>
                      {r.inputSummary || '\u2014'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[200px] truncate" title={r.outputSummary}>
                      {r.outputSummary || '\u2014'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.rendemenPct !== null ? (
                        <span className={cn(
                          'font-mono font-semibold tabular-nums text-sm',
                          r.rendemenPct >= 60 ? 'text-green-600' : r.rendemenPct >= 50 ? 'text-amber-600' : 'text-red-600'
                        )}>
                          {r.rendemenPct.toFixed(1)}%
                        </span>
                      ) : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- Sub-components ---------- */

const COLOR_MAP: Record<string, { bg: string; text: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500' },
  green: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500' },
};

function KPICard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode; color: string;
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.blue;
  return (
    <div className={cn('rounded-xl p-4 border border-transparent', c.bg)}>
      <div className={cn('mb-2', c.icon)}>{icon}</div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums mt-0.5', c.text)}>{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function RankList({ title, icon, items, color }: {
  title: string; icon: React.ReactNode;
  items: { id: string; name: string; unit: string; quantity: number }[]; color: string;
}) {
  const barColor = color === 'blue' ? 'bg-blue-400' : 'bg-green-400';
  const maxVal = items.length > 0 ? items[0].quantity : 1;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Tidak ada data</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item, i) => {
            const pct = Math.max(5, (item.quantity / maxVal) * 100);
            return (
              <div key={item.id}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-gray-700 font-medium truncate mr-2">
                    <span className="text-gray-400 mr-1">{i + 1}.</span>
                    {item.name}
                  </span>
                  <span className="text-xs font-mono font-semibold text-gray-600 tabular-nums shrink-0">
                    {fmtNum(item.quantity, 1)} {item.unit}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cn(barColor, 'h-full rounded-full')} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RendemenTrendChart({ trend }: { trend: { date: string; avgRendemen: number; count: number }[] }) {
  const values = trend.map(d => d.avgRendemen);
  const minVal = Math.floor(Math.min(...values) / 5) * 5; // round down to nearest 5
  const maxVal = Math.ceil(Math.max(...values) / 5) * 5;  // round up to nearest 5
  const range = maxVal - minVal || 10;

  // Y-axis grid lines
  const gridLines = [];
  const step = range <= 20 ? 5 : 10;
  for (let v = minVal; v <= maxVal; v += step) {
    gridLines.push(v);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <BarChart3 size={14} className="text-gray-400" />
        Tren Rendemen Harian
      </h3>
      <div className="relative" style={{ minHeight: '200px' }}>
        {/* Y-axis grid + labels */}
        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between">
          {gridLines.slice().reverse().map(v => (
            <span key={v} className="text-[9px] text-gray-400 font-mono tabular-nums text-right pr-1">
              {v}%
            </span>
          ))}
        </div>

        {/* Chart area */}
        <div className="ml-11 relative" style={{ height: '180px' }}>
          {/* Horizontal grid lines */}
          {gridLines.map(v => {
            const bottom = ((v - minVal) / range) * 100;
            return (
              <div
                key={v}
                className="absolute left-0 right-0 border-t border-gray-100"
                style={{ bottom: `${bottom}%` }}
              />
            );
          })}

          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-1.5 px-1">
            {trend.map((d) => {
              const heightPct = Math.max(3, ((d.avgRendemen - minVal) / range) * 100);
              const isGood = d.avgRendemen >= 60;
              const day = d.date.slice(8);
              const month = d.date.slice(5, 7);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center" style={{ height: '100%' }}>
                  <div className="flex-1 w-full flex flex-col items-center justify-end">
                    {/* Value label on top */}
                    <span className={cn(
                      'text-[9px] font-semibold tabular-nums mb-0.5',
                      isGood ? 'text-green-600' : 'text-amber-600'
                    )}>
                      {d.avgRendemen.toFixed(1)}%
                    </span>
                    {/* Bar */}
                    <div
                      className={cn(
                        'w-full max-w-[40px] rounded-t-md transition-all',
                        isGood ? 'bg-green-400' : 'bg-amber-400'
                      )}
                      style={{ height: `${heightPct}%`, minHeight: '6px' }}
                    />
                  </div>
                  {/* X-axis label */}
                  <span className="text-[9px] text-gray-400 mt-1 tabular-nums">{day}/{month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Count labels */}
        <div className="ml-11 flex gap-1.5 px-1 mt-0.5">
          {trend.map(d => (
            <div key={d.date} className="flex-1 text-center">
              <span className="text-[8px] text-gray-300">{d.count}x</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RendemenList({ title, icon, items, color }: {
  title: string; icon: React.ReactNode;
  items: { runNumber: string; date: string; rendemenPct: number }[]; color: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Tidak ada data</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.runNumber} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded shrink-0">
                  {item.runNumber}
                </span>
                <span className="text-xs text-gray-400 truncate">{formatDate(item.date)}</span>
              </div>
              <span className={cn(
                'font-mono font-semibold text-sm tabular-nums shrink-0 ml-2',
                color === 'green' ? 'text-green-600' : 'text-red-600'
              )}>
                {item.rendemenPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
