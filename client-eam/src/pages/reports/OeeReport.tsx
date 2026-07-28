import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Gauge, Clock, Cog, Layers, Activity, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import api from '../../lib/api';
import { cn } from '../../lib/utils';

interface OeeSummary {
  totalRuns: number;
  runsWithOee: number;
  avgOee: number;
  avgAvailability: number;
  avgPerformance: number;
  avgQuality: number;
  totalDowntimeMin: number;
  machinesUsed: number;
}

interface TrendRow {
  date: string;
  runs: number;
  avgOee: number;
  avgAvailability: number;
  avgPerformance: number;
  avgQuality: number;
}

interface MachineRow {
  machineId: string;
  code: string;
  name: string;
  runs: number;
  avgOee: number;
  avgAvailability: number;
  avgPerformance: number;
  avgQuality: number;
  totalRunMin: number;
  totalDowntimeMin: number;
  totalAllocatedQty: number;
}

interface ShiftRow {
  shift: string;
  runs: number;
  avgOee: number;
  avgAvailability: number;
  avgPerformance: number;
  avgQuality: number;
}

interface DowntimeRow {
  category: string;
  totalMin: number;
  count: number;
}

interface OeeReportData {
  summary: OeeSummary;
  trend: TrendRow[];
  perMachine: MachineRow[];
  perShift: ShiftRow[];
  downtimeByCategory: DowntimeRow[];
}

const thisMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayStr = () => new Date().toISOString().split('T')[0];

const fmtPct = (n: number) => `${Number(n).toFixed(1)}%`;
const fmtNum = (n: number, decimals = 1) =>
  Number(n).toLocaleString('id-ID', { maximumFractionDigits: decimals });
const fmtMinutes = (min: number) => {
  if (min <= 0) return '0 menit';
  const hours = min / 60;
  return `${fmtNum(min, 0)} menit (${fmtNum(hours, 1)} jam)`;
};

// Warna OEE: hijau ≥ 85 (world-class), kuning ≥ 60, merah < 60.
const oeeColorClass = (pct: number) =>
  pct >= 85 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';

export default function OeeReport() {
  const [startDate, setStartDate] = useState(thisMonthStr());
  const [endDate, setEndDate] = useState(todayStr());

  const { data, isLoading } = useQuery<OeeReportData>({
    queryKey: ['report-oee', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/inventory/dashboard/oee', { params: { startDate, endDate } });
      return res.data;
    },
  });

  const summary = data?.summary;
  const trend = data?.trend ?? [];
  const perMachine = data?.perMachine ?? [];
  const perShift = data?.perShift ?? [];
  const downtime = data?.downtimeByCategory ?? [];

  // Pareto cumulative %
  const downtimeTotal = downtime.reduce((s, d) => s + d.totalMin, 0);
  let cumMin = 0;
  const downtimeWithCum = downtime.map((d) => {
    cumMin += d.totalMin;
    return {
      ...d,
      cumulativePct: downtimeTotal > 0 ? Math.round((cumMin / downtimeTotal) * 1000) / 10 : 0,
    };
  });
  const maxDowntime = downtime.length > 0 ? downtime[0].totalMin : 1;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/reports" className="p-1.5 hover:bg-gray-100 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Laporan OEE
        </h1>
      </div>

      {/* Info banner */}
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <Activity size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <strong>OEE (Overall Equipment Effectiveness)</strong> = Availability × Performance × Quality.
          Semua angka adalah <strong>rata-rata</strong> dari nilai per run yang sudah tercatat dalam periode.
          World-class ≈ 85%.
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Dari</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Sampai</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
        </div>
        {(startDate !== thisMonthStr() || endDate !== todayStr()) && (
          <button
            type="button"
            onClick={() => { setStartDate(thisMonthStr()); setEndDate(todayStr()); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium py-2"
          >
            Reset
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !summary ? (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Tidak ada data.
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard icon={<Gauge size={16} />} label="OEE" value={fmtPct(summary.avgOee)} valueClass={oeeColorClass(summary.avgOee)} />
            <KpiCard icon={<Activity size={16} />} label="Availability" value={fmtPct(summary.avgAvailability)} />
            <KpiCard icon={<Activity size={16} />} label="Performance" value={fmtPct(summary.avgPerformance)} />
            <KpiCard icon={<Activity size={16} />} label="Quality" value={fmtPct(summary.avgQuality)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard icon={<Layers size={16} />} label="Total Run" value={fmtNum(summary.totalRuns, 0)}
              sub={`${summary.runsWithOee} run dengan OEE`} />
            <KpiCard icon={<Clock size={16} />} label="Total Downtime" value={fmtMinutes(summary.totalDowntimeMin)} small />
            <KpiCard icon={<Cog size={16} />} label="Mesin Dipakai" value={fmtNum(summary.machinesUsed, 0)} />
          </div>

          {/* Trend chart */}
          <div className="card p-5 mb-6">
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              Tren OEE Harian
            </h2>
            {trend.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>Tidak ada data</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(5) : v)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name]}
                    labelFormatter={(label: any, payload: any) => {
                      const runs = payload?.[0]?.payload?.runs ?? 0;
                      return `${label} — ${runs} run`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="avgOee" name="OEE" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="avgAvailability" name="Availability" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="avgPerformance" name="Performance" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="avgQuality" name="Quality" stroke="#0ea5e9" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Per Machine table */}
          <div className="card overflow-hidden mb-6">
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                <Cog size={14} style={{ color: 'var(--color-text-muted)' }} /> Per Mesin
              </h2>
            </div>
            {perMachine.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Tidak ada data</div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama</th>
                      <th className="text-right">Run</th>
                      <th className="text-right">Avail.</th>
                      <th className="text-right">Perf.</th>
                      <th className="text-right">Qual.</th>
                      <th className="text-right">OEE</th>
                      <th className="text-right">Jam Jalan</th>
                      <th className="text-right">Downtime</th>
                      <th className="text-right">Output Alokasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perMachine.map((m) => (
                      <tr key={m.machineId}>
                        <td className="font-mono text-xs">{m.code || '—'}</td>
                        <td className="font-medium">{m.name || '—'}</td>
                        <td className="text-right tabular-nums">{fmtNum(m.runs, 0)}</td>
                        <td className="text-right tabular-nums">{fmtPct(m.avgAvailability)}</td>
                        <td className="text-right tabular-nums">{fmtPct(m.avgPerformance)}</td>
                        <td className="text-right tabular-nums">{fmtPct(m.avgQuality)}</td>
                        <td className={cn('text-right tabular-nums font-semibold', oeeColorClass(m.avgOee))}>{fmtPct(m.avgOee)}</td>
                        <td className="text-right tabular-nums">{fmtNum(m.totalRunMin / 60, 1)} jam</td>
                        <td className="text-right tabular-nums">{fmtNum(m.totalDowntimeMin, 0)} mnt</td>
                        <td className="text-right tabular-nums">{fmtNum(m.totalAllocatedQty, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Per Shift + Downtime Pareto */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Per Shift */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                  <Layers size={14} style={{ color: 'var(--color-text-muted)' }} /> Per Shift
                </h2>
              </div>
              {perShift.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Tidak ada data</div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Shift</th>
                        <th className="text-right">Run</th>
                        <th className="text-right">Avail.</th>
                        <th className="text-right">Perf.</th>
                        <th className="text-right">Qual.</th>
                        <th className="text-right">OEE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perShift.map((s) => (
                        <tr key={s.shift}>
                          <td className="font-medium">{s.shift}</td>
                          <td className="text-right tabular-nums">{fmtNum(s.runs, 0)}</td>
                          <td className="text-right tabular-nums">{fmtPct(s.avgAvailability)}</td>
                          <td className="text-right tabular-nums">{fmtPct(s.avgPerformance)}</td>
                          <td className="text-right tabular-nums">{fmtPct(s.avgQuality)}</td>
                          <td className={cn('text-right tabular-nums font-semibold', oeeColorClass(s.avgOee))}>{fmtPct(s.avgOee)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Downtime Pareto */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                  <Clock size={14} style={{ color: 'var(--color-text-muted)' }} /> Downtime per Kategori (Pareto)
                </h2>
              </div>
              {downtimeWithCum.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Tidak ada data</div>
              ) : (
                <div className="p-4 space-y-3">
                  {downtimeWithCum.map((d) => {
                    const barPct = maxDowntime > 0 ? Math.max(4, (d.totalMin / maxDowntime) * 100) : 0;
                    return (
                      <div key={d.category}>
                        <div className="flex items-center justify-between mb-0.5 text-xs">
                          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{d.category}</span>
                          <span className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                            {fmtNum(d.totalMin, 0)} mnt · {d.count}x · kum {d.cumulativePct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                          <div className="h-full rounded-full bg-red-400" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, valueClass, small }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  small?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-2" style={{ color: 'var(--color-text-muted)' }}>
        {icon}
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={cn(small ? 'text-base' : 'text-lg', 'font-bold tabular-nums', valueClass)}
        style={valueClass ? undefined : { color: 'var(--color-text-primary)' }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}
