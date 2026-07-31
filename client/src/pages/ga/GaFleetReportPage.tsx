// Report Armada — analisis biaya lintas-kendaraan (TCO fleet-level):
// distribusi biaya per kategori, trend bulanan, top spender, ringkasan
// kepatuhan dokumen, dan tabel detail per kendaraan.
// Data dari GET /ga/vehicle/fleet-report.
import { useState, useMemo } from 'react';
import {
  BarChart3, Loader2, Car, Wallet, TriangleAlert, TrendingUp,
  Download, ArrowUpDown, Search,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { cn } from '../../lib/utils';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { exportToExcel } from '../../lib/exportExcel';
import { toast } from 'sonner';

type ComplianceState = 'EXPIRED' | 'EXPIRING' | 'OK' | 'NONE';
type CostCategory = 'service' | 'fuel' | 'tax' | 'insurance' | 'incident';

interface Breakdown { service: number; fuel: number; tax: number; insurance: number; incident: number }

interface FleetVehicle {
  assetId: string;
  code: string;
  name: string;
  noPlat: string | null;
  brand: string | null;
  tipe: string | null;
  categoryName: string | null;
  status: string;
  condition: string;
  odometerTerakhir: number | null;
  breakdown: Breakdown;
  totalCost: number;
  costPerMonth: number;
  totalLiters: number;
  taxState: ComplianceState;
  taxDueDate: string | null;
  insuranceState: ComplianceState;
  insuranceEndDate: string | null;
  openIncidentCount: number;
  issueCount: number;
}

interface FleetReport {
  period: { from: string; to: string; months: number };
  vehicles: FleetVehicle[];
  totals: Breakdown & { totalCost: number; vehicleCount: number; costPerVehicle: number };
  distribution: { category: CostCategory; amount: number; percentage: number }[];
  topSpenders: { assetId: string; code: string; name: string; noPlat: string | null; totalCost: number; costPerMonth: number; breakdown: Breakdown }[];
  monthlyTrend: (Breakdown & { month: string; total: number })[];
  compliance: { taxIssues: number; insuranceIssues: number; openIncidents: number; vehiclesWithIssues: number };
}

const CAT_LABEL: Record<CostCategory, string> = {
  service: 'Service & Perawatan',
  fuel: 'Bahan Bakar',
  tax: 'Pajak Kendaraan',
  insurance: 'Asuransi',
  incident: 'Insiden & Perbaikan',
};

const CAT_BAR: Record<CostCategory, string> = {
  service: 'bg-teal-500',
  fuel: 'bg-blue-500',
  tax: 'bg-amber-500',
  insurance: 'bg-violet-500',
  incident: 'bg-rose-500',
};

const STATE_BADGE: Record<ComplianceState, string> = {
  EXPIRED: 'badge-red',
  EXPIRING: 'badge-yellow',
  OK: 'badge-green',
  NONE: 'badge-gray',
};

const STATE_LABEL: Record<ComplianceState, string> = {
  EXPIRED: 'Lewat',
  EXPIRING: 'Segera',
  OK: 'Aman',
  NONE: '—',
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} '${String(y).slice(2)}`;
};
const numId = (v: number, digits = 0) =>
  v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });

type SortKey = 'code' | 'totalCost' | 'costPerMonth' | 'issueCount';

export function GaFleetReportPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalCost');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, isError, error } = useQuery<FleetReport>({
    queryKey: ['ga-fleet-report', dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      return (await api.get('/ga/vehicle/fleet-report', { params })).data;
    },
  });

  const trendMax = useMemo(
    () => Math.max(1, ...(data?.monthlyTrend ?? []).map((m) => m.total)),
    [data],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? data.vehicles.filter((v) =>
          [v.code, v.name, v.noPlat, v.brand, v.tipe, v.categoryName]
            .some((f) => f && f.toLowerCase().includes(q)),
        )
      : data.vehicles;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'code') return a.code.localeCompare(b.code) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [data, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'code' ? 'asc' : 'desc'); }
  };

  const handleExport = async () => {
    if (!rows.length) { toast.error('Tidak ada data untuk diekspor.'); return; }
    try {
      await exportToExcel(
        rows.map((v) => ({
          'Kode Aset': v.code,
          'Nama': v.name,
          'No. Plat': v.noPlat ?? '',
          'Merek': v.brand ?? '',
          'Tipe': v.tipe ?? '',
          'Kategori': v.categoryName ?? '',
          'Status': v.status,
          'Kondisi': v.condition,
          'Odometer (km)': v.odometerTerakhir ?? '',
          'Service': v.breakdown.service,
          'BBM': v.breakdown.fuel,
          'Pajak': v.breakdown.tax,
          'Asuransi': v.breakdown.insurance,
          'Insiden': v.breakdown.incident,
          'Total Biaya': v.totalCost,
          'Biaya/Bulan': Math.round(v.costPerMonth),
          'Liter BBM': v.totalLiters,
          'Status Pajak': STATE_LABEL[v.taxState],
          'Jatuh Tempo Pajak': v.taxDueDate ? formatDate(v.taxDueDate) : '',
          'Status Asuransi': STATE_LABEL[v.insuranceState],
          'Akhir Asuransi': v.insuranceEndDate ? formatDate(v.insuranceEndDate) : '',
          'Insiden Terbuka': v.openIncidentCount,
          'Total Isu': v.issueCount,
        })),
        `Report-Armada-${new Date().toISOString().slice(0, 10)}`,
      );
      toast.success('Report armada diekspor.');
    } catch {
      toast.error('Gagal mengekspor report.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Memuat report armada…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="card p-8 text-center">
        <TriangleAlert size={28} className="mx-auto text-red-400 mb-3" />
        <p className="text-sm text-gray-600">
          Gagal memuat report armada. {(error as any)?.response?.data?.error ?? ''}
        </p>
      </div>
    );
  }

  const { totals, distribution, compliance, period } = data;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 size={20} className="text-teal-600" /> Report Armada
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Analisis biaya kepemilikan lintas-kendaraan: distribusi biaya, trend bulanan, kendaraan
            paling boros, dan ringkasan kepatuhan dokumen.
          </p>
        </div>
        <button onClick={handleExport} className="btn-secondary w-fit">
          <Download size={14} /> Export Excel
        </button>
      </div>

      {/* Filter periode */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dari Tanggal</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sampai Tanggal</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field" />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="w-full px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Reset (12 bulan terakhir)
            </button>
          </div>
          <div className="flex items-end">
            <p className="text-xs text-gray-500">
              Periode aktif: <span className="font-medium text-gray-700">{formatDate(period.from)} — {formatDate(period.to)}</span>
              {' '}({period.months} bulan)
            </p>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={<Wallet size={16} className="text-teal-600" />} iconBg="bg-teal-50"
          label="Total Biaya Armada" value={formatRupiah(totals.totalCost)}
          sub={`${formatRupiah(totals.totalCost / period.months)} / bulan`}
        />
        <Kpi
          icon={<Car size={16} className="text-blue-600" />} iconBg="bg-blue-50"
          label="Jumlah Kendaraan" value={String(totals.vehicleCount)}
          sub={`${formatRupiah(totals.costPerVehicle)} / kendaraan`}
        />
        <Kpi
          icon={<TrendingUp size={16} className="text-violet-600" />} iconBg="bg-violet-50"
          label="Kategori Terbesar"
          value={distribution.length ? CAT_LABEL[[...distribution].sort((a, b) => b.amount - a.amount)[0].category] : '—'}
          sub={distribution.length ? `${numId([...distribution].sort((a, b) => b.amount - a.amount)[0].percentage, 1)}% dari total` : '—'}
        />
        <Kpi
          icon={<TriangleAlert size={16} className={compliance.vehiclesWithIssues ? 'text-red-600' : 'text-green-600'} />}
          iconBg={compliance.vehiclesWithIssues ? 'bg-red-50' : 'bg-green-50'}
          label="Kendaraan Bermasalah" value={String(compliance.vehiclesWithIssues)}
          sub={`${compliance.taxIssues} pajak · ${compliance.insuranceIssues} asuransi · ${compliance.openIncidents} insiden`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribusi biaya */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Distribusi Biaya per Kategori</h2>
          {totals.totalCost === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Belum ada biaya tercatat pada periode ini.</p>
          ) : (
            <div className="space-y-3">
              {[...distribution].sort((a, b) => b.amount - a.amount).map((d) => (
                <div key={d.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{CAT_LABEL[d.category]}</span>
                    <span className="text-gray-500">
                      {formatRupiah(d.amount)} · {numId(d.percentage, 1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', CAT_BAR[d.category])} style={{ width: `${d.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top spender */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">10 Kendaraan Biaya Tertinggi</h2>
          {data.topSpenders.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Belum ada data biaya.</p>
          ) : (
            <div className="space-y-2">
              {data.topSpenders.map((v, i) => {
                const pct = data.topSpenders[0].totalCost > 0 ? (v.totalCost / data.topSpenders[0].totalCost) * 100 : 0;
                return (
                  <div key={v.assetId} className="flex items-center gap-3">
                    <span className="w-5 text-xs font-semibold text-gray-400 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <Link to="/ga/vehicle" className="font-medium text-gray-700 truncate hover:text-teal-600">
                          {v.noPlat ?? v.code} <span className="text-gray-400 font-normal">· {v.name}</span>
                        </Link>
                        <span className="text-gray-500 shrink-0 ml-2">{formatRupiah(v.totalCost)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Trend bulanan */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Trend Biaya Bulanan Armada</h2>
        {data.monthlyTrend.every((m) => m.total === 0) ? (
          <p className="text-sm text-gray-400 py-6 text-center">Belum ada biaya tercatat pada periode ini.</p>
        ) : (
          <>
            <div className="flex items-end gap-1.5 h-40 border-b border-gray-100 pb-1">
              {data.monthlyTrend.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div
                    className="w-full bg-teal-500/80 hover:bg-teal-600 rounded-t transition-colors min-h-[2px]"
                    style={{ height: `${(m.total / trendMax) * 100}%` }}
                  />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white">
                    {monthLabel(m.month)}: {formatRupiah(m.total)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1">
              {data.monthlyTrend.map((m) => (
                <span key={m.month} className="flex-1 text-center text-[9px] text-gray-400 truncate">
                  {monthLabel(m.month)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Tabel detail */}
      <div className="card p-0 overflow-hidden">
        <div className="flex flex-col gap-3 p-4 border-b border-gray-100 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Detail per Kendaraan</h2>
            <p className="text-xs text-gray-500 mt-1">Tampil {rows.length} dari {data.vehicles.length} kendaraan.</p>
          </div>
          <div className="relative w-full lg:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari plat, kode, merek…"
              className="input-field pl-9"
            />
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th><SortHeader label="Kendaraan" active={sortKey === 'code'} dir={sortDir} onClick={() => toggleSort('code')} /></th>
                <th className="text-right">Service</th>
                <th className="text-right">BBM</th>
                <th className="text-right">Pajak</th>
                <th className="text-right">Asuransi</th>
                <th className="text-right">Insiden</th>
                <th className="text-right"><SortHeader label="Total" active={sortKey === 'totalCost'} dir={sortDir} onClick={() => toggleSort('totalCost')} align="right" /></th>
                <th className="text-right"><SortHeader label="/Bulan" active={sortKey === 'costPerMonth'} dir={sortDir} onClick={() => toggleSort('costPerMonth')} align="right" /></th>
                <th className="text-center">Pajak</th>
                <th className="text-center">Asuransi</th>
                <th className="text-center"><SortHeader label="Isu" active={sortKey === 'issueCount'} dir={sortDir} onClick={() => toggleSort('issueCount')} align="center" /></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={11} className="py-10 text-center text-sm text-gray-400">Tidak ada kendaraan yang cocok.</td></tr>
              ) : rows.map((v) => (
                <tr key={v.assetId}>
                  <td>
                    <div className="font-medium text-gray-900">{v.noPlat ?? v.code}</div>
                    <div className="text-xs text-gray-400">
                      {[v.brand, v.tipe].filter(Boolean).join(' ') || v.name}
                    </div>
                  </td>
                  <td className="text-right text-gray-600">{v.breakdown.service ? formatRupiah(v.breakdown.service) : '—'}</td>
                  <td className="text-right text-gray-600">{v.breakdown.fuel ? formatRupiah(v.breakdown.fuel) : '—'}</td>
                  <td className="text-right text-gray-600">{v.breakdown.tax ? formatRupiah(v.breakdown.tax) : '—'}</td>
                  <td className="text-right text-gray-600">{v.breakdown.insurance ? formatRupiah(v.breakdown.insurance) : '—'}</td>
                  <td className="text-right text-gray-600">{v.breakdown.incident ? formatRupiah(v.breakdown.incident) : '—'}</td>
                  <td className="text-right font-semibold text-gray-900">{formatRupiah(v.totalCost)}</td>
                  <td className="text-right text-gray-600">{formatRupiah(v.costPerMonth)}</td>
                  <td className="text-center">
                    <span className={cn('badge', STATE_BADGE[v.taxState])}>{STATE_LABEL[v.taxState]}</span>
                  </td>
                  <td className="text-center">
                    <span className={cn('badge', STATE_BADGE[v.insuranceState])}>{STATE_LABEL[v.insuranceState]}</span>
                  </td>
                  <td className="text-center">
                    {v.issueCount > 0
                      ? <span className="badge badge-red">{v.issueCount}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/60 font-semibold text-gray-900">
                  <td>Total ({rows.length} kendaraan)</td>
                  <td className="text-right">{formatRupiah(rows.reduce((s, v) => s + v.breakdown.service, 0))}</td>
                  <td className="text-right">{formatRupiah(rows.reduce((s, v) => s + v.breakdown.fuel, 0))}</td>
                  <td className="text-right">{formatRupiah(rows.reduce((s, v) => s + v.breakdown.tax, 0))}</td>
                  <td className="text-right">{formatRupiah(rows.reduce((s, v) => s + v.breakdown.insurance, 0))}</td>
                  <td className="text-right">{formatRupiah(rows.reduce((s, v) => s + v.breakdown.incident, 0))}</td>
                  <td className="text-right text-teal-700">{formatRupiah(rows.reduce((s, v) => s + v.totalCost, 0))}</td>
                  <td className="text-right">{formatRupiah(rows.reduce((s, v) => s + v.costPerMonth, 0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, iconBg, label, value, sub }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg shrink-0', iconBg)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5 truncate">{value}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function SortHeader({ label, active, dir, onClick, align = 'left' }: {
  label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; align?: 'left' | 'right' | 'center';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 hover:text-teal-600 transition-colors',
        active && 'text-teal-600',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {label}
      <ArrowUpDown size={11} className={cn('opacity-40', active && 'opacity-100')} />
      {active && <span className="sr-only">{dir === 'asc' ? 'naik' : 'turun'}</span>}
    </button>
  );
}

export default GaFleetReportPage;
