/**
 * Tab "Report" pada halaman Kendaraan — analisis TCO, kepatuhan dokumen,
 * dan kondisi fisik untuk satu kendaraan. Data dari GET /ga/vehicle/assets/:id/report.
 */
import { useState, useMemo } from 'react';
import {
  Loader2, TrendingUp, Wrench, Fuel, FileWarning, ShieldCheck,
  TriangleAlert, ClipboardCheck, Download, Printer, Gauge, CircleDot,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { pdf } from '@react-pdf/renderer';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatRupiah, formatDate } from '../lib/formatters';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import VehicleReportPDF from '../lib/pdf/VehicleReportPDF';
import { toast } from 'sonner';

export type ComplianceState = 'EXPIRED' | 'EXPIRING' | 'OK' | 'NONE';

export interface VehicleReport {
  period: { from: string; to: string; months: number };
  asset: {
    id: string; code: string; name: string; categoryName: string | null;
    status: string; condition: string; noPlat: string | null; brand: string | null;
    tipe: string | null; tahunProduksi: number | null; odometerTerakhir: number | null;
  };
  tco: {
    breakdown: { service: number; fuel: number; tax: number; insurance: number; incident: number };
    totalCost: number; costPerMonth: number; distanceKm: number | null;
    costPerKm: number | null; fuelCostPerKm: number | null; totalLiters: number;
    kmPerLiter: number | null;
    counts: { service: number; fuel: number; tax: number; insurance: number; incident: number };
  };
  monthlyTrend: { month: string; service: number; fuel: number; tax: number; insurance: number; incident: number; total: number }[];
  compliance: {
    taxes: { type: string; periodYear: number; dueDate: string; paidAt: string | null; amount: number; state: ComplianceState; daysRemaining: number | null }[];
    insurances: { type: string; provider: string | null; endDate: string; premium: number; state: ComplianceState; daysRemaining: number | null }[];
    openIncidents: { tanggal: string; severity: string; status: string; description: string | null; cost: number }[];
    issueCount: number;
  };
  condition: {
    lastInspection: { tanggal: string; overallResult: string; odometer: number | null; notes: string | null } | null;
    activeTires: { position: string; brand: string | null; serialNumber: string | null; installedAt: string; installedOdometer: number | null; usageKm: number | null }[];
    activeTireCount: number;
    lastOil: { tanggal: string; odometer: number; nextOdometerDue: number; brand: string | null; volume: number; remainingKm: number | null; isDue: boolean | null } | null;
  };
}

const COST_META: { key: keyof VehicleReport['tco']['breakdown']; label: string; color: string; bar: string; icon: React.ReactNode }[] = [
  { key: 'service',   label: 'Service',   color: 'text-teal-700',   bar: 'bg-teal-500',   icon: <Wrench size={14} /> },
  { key: 'fuel',      label: 'BBM',       color: 'text-purple-700', bar: 'bg-purple-500', icon: <Fuel size={14} /> },
  { key: 'tax',       label: 'Pajak',     color: 'text-red-700',    bar: 'bg-red-500',    icon: <FileWarning size={14} /> },
  { key: 'insurance', label: 'Asuransi',  color: 'text-amber-700',  bar: 'bg-amber-500',  icon: <ShieldCheck size={14} /> },
  { key: 'incident',  label: 'Insiden',   color: 'text-orange-700', bar: 'bg-orange-500', icon: <TriangleAlert size={14} /> },
];

const STATE_BADGE: Record<ComplianceState, string> = {
  EXPIRED: 'badge-red',
  EXPIRING: 'badge-amber',
  OK: 'badge-green',
  NONE: 'badge-gray',
};
const STATE_LABEL: Record<ComplianceState, string> = {
  EXPIRED: 'Lewat Jatuh Tempo',
  EXPIRING: 'Segera Jatuh Tempo',
  OK: 'Aman',
  NONE: '—',
};

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

/** Default rentang: 12 bulan terakhir (awal bulan 11 bulan lalu s/d akhir bulan ini). */
function defaultRange() {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const from = new Date(to.getFullYear(), to.getMonth() - 11, 1);
  return { from: toDateInput(from), to: toDateInput(to) };
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${names[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
};

const numberFmt = (v: number, digits = 0) =>
  v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function GaVehicleReportTab({ assetId }: { assetId: string }) {
  const [range, setRange] = useState(defaultRange);
  const [isExporting, setIsExporting] = useState(false);
  const company = useCompanyPDF();

  const { data: report, isLoading, isError } = useQuery<VehicleReport>({
    queryKey: ['ga-vehicle-report', assetId, range.from, range.to],
    queryFn: async () =>
      (await api.get(`/ga/vehicle/assets/${assetId}/report`, { params: { from: range.from, to: range.to } })).data,
    enabled: !!assetId,
  });

  const maxTrend = useMemo(
    () => Math.max(1, ...(report?.monthlyTrend ?? []).map((m) => m.total)),
    [report],
  );

  const handleExportPdf = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      const blob = await pdf(
        <VehicleReportPDF
          report={report}
          company={{ name: company.name, address: company.address }}
          generatedAt={new Date()}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report-Kendaraan_${report.asset.code}_${range.from}_${range.to}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Gagal membuat PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      const blob = await pdf(
        <VehicleReportPDF
          report={report}
          company={{ name: company.name, address: company.address }}
          generatedAt={new Date()}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url);
      if (!w) {
        toast.error('Popup diblokir browser. Izinkan popup untuk mencetak.');
        URL.revokeObjectURL(url);
        return;
      }
      w.addEventListener('load', () => w.print());
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Gagal menyiapkan cetak.');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card py-16 text-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }
  if (isError || !report) {
    return <div className="card py-16 text-center text-sm text-gray-400">Gagal memuat report kendaraan.</div>;
  }

  const { tco, compliance, condition, asset } = report;

  return (
    <div className="space-y-4">
      {/* Filter periode + aksi export */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dari</label>
            <input
              type="date" value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sampai</label>
            <input
              type="date" value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button onClick={() => setRange(defaultRange())} className="btn-secondary">12 Bulan Terakhir</button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={handlePrint} disabled={isExporting} className="btn-secondary">
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Cetak
            </button>
            <button onClick={handleExportPdf} disabled={isExporting} className="btn-primary bg-teal-600 hover:bg-teal-700">
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Periode {formatDate(report.period.from)} — {formatDate(report.period.to)} ({report.period.months} bulan)
        </p>
      </div>

      {/* KPI utama */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportKpi icon={<TrendingUp size={16} className="text-teal-600" />} iconBg="bg-teal-50"
          label="Total Biaya (TCO)" value={formatRupiah(tco.totalCost)} sub={`${formatRupiah(tco.costPerMonth)}/bulan`} />
        <ReportKpi icon={<Gauge size={16} className="text-blue-600" />} iconBg="bg-blue-50"
          label="Biaya per KM" value={tco.costPerKm != null ? formatRupiah(tco.costPerKm) : '—'}
          sub={tco.distanceKm != null ? `${numberFmt(tco.distanceKm)} km tercatat` : 'Data odometer belum cukup'} />
        <ReportKpi icon={<Fuel size={16} className="text-purple-600" />} iconBg="bg-purple-50"
          label="Konsumsi BBM" value={tco.kmPerLiter != null ? `${numberFmt(tco.kmPerLiter, 1)} km/L` : '—'}
          sub={`${numberFmt(tco.totalLiters, 1)} liter · ${formatRupiah(tco.breakdown.fuel)}`} />
        <ReportKpi icon={<TriangleAlert size={16} className={compliance.issueCount > 0 ? 'text-red-600' : 'text-green-600'} />}
          iconBg={compliance.issueCount > 0 ? 'bg-red-50' : 'bg-green-50'}
          label="Isu Kepatuhan" value={String(compliance.issueCount)}
          sub={compliance.issueCount > 0 ? 'Perlu tindak lanjut' : 'Semua dokumen aman'} />
      </div>

      {/* Identitas kendaraan */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Identitas Kendaraan</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Kode Aset" value={asset.code} mono />
          <Field label="Nomor Plat" value={asset.noPlat ?? '—'} mono />
          <Field label="Merek / Tipe" value={[asset.brand, asset.tipe].filter(Boolean).join(' ') || '—'} />
          <Field label="Tahun Produksi" value={asset.tahunProduksi != null ? String(asset.tahunProduksi) : '—'} />
          <Field label="Kategori" value={asset.categoryName ?? '—'} />
          <Field label="Status" value={asset.status} />
          <Field label="Kondisi" value={asset.condition} />
          <Field label="Odometer Terakhir" value={asset.odometerTerakhir != null ? `${numberFmt(asset.odometerTerakhir)} km` : '—'} />
        </div>
      </div>

      {/* Breakdown biaya */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Rincian Biaya Periode</h2>
        {tco.totalCost === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Belum ada biaya tercatat pada periode ini.</p>
        ) : (
          <div className="space-y-2.5">
            {COST_META.map((m) => {
              const amount = tco.breakdown[m.key];
              const pct = tco.totalCost > 0 ? (amount / tco.totalCost) * 100 : 0;
              return (
                <div key={m.key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={cn('flex items-center gap-1.5 font-medium', m.color)}>
                      {m.icon} {m.label}
                      <span className="text-gray-400 font-normal">({tco.counts[m.key]} transaksi)</span>
                    </span>
                    <span className="font-mono tabular-nums text-gray-900">
                      {formatRupiah(amount)} <span className="text-gray-400">· {numberFmt(pct, 1)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', m.bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-gray-100 text-sm font-semibold">
              <span className="text-gray-700">Total</span>
              <span className="font-mono tabular-nums text-teal-700">{formatRupiah(tco.totalCost)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Trend bulanan */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Trend Biaya Bulanan</h2>
        {report.monthlyTrend.every((m) => m.total === 0) ? (
          <p className="py-8 text-center text-sm text-gray-400">Belum ada data biaya pada periode ini.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-40 overflow-x-auto pb-1">
            {report.monthlyTrend.map((m) => (
              <div key={m.month} className="flex-1 min-w-[32px] flex flex-col items-center justify-end h-full group relative">
                <div className="w-full flex flex-col justify-end h-full">
                  {COST_META.map((meta) => {
                    const v = m[meta.key];
                    if (!v) return null;
                    return <div key={meta.key} className={cn('w-full', meta.bar)} style={{ height: `${(v / maxTrend) * 100}%` }} />;
                  })}
                </div>
                <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">{monthLabel(m.month)}</span>
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                  {monthLabel(m.month)}: {formatRupiah(m.total)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          {COST_META.map((m) => (
            <span key={m.key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={cn('w-2.5 h-2.5 rounded-sm', m.bar)} /> {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Kepatuhan dokumen */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FileWarning size={16} className="text-teal-600" /> Kepatuhan Dokumen
          </h2>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Dokumen</th><th>Keterangan</th><th>Jatuh Tempo</th>
                <th className="text-center">Sisa Hari</th><th className="text-center">Status</th>
                <th className="text-right">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {compliance.taxes.length === 0 && compliance.insurances.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">Belum ada dokumen aktif.</td></tr>
              ) : (
                <>
                  {compliance.taxes.map((t, i) => (
                    <tr key={`tax-${i}`}>
                      <td><span className="badge badge-blue">Pajak</span></td>
                      <td className="text-gray-700">{t.type} · TA {t.periodYear}</td>
                      <td className="text-gray-700">{formatDate(t.dueDate)}</td>
                      <td className="text-center font-mono tabular-nums text-gray-700">{t.daysRemaining ?? '—'}</td>
                      <td className="text-center"><span className={`badge ${STATE_BADGE[t.state]}`}>{STATE_LABEL[t.state]}</span></td>
                      <td className="text-right font-mono tabular-nums text-gray-900">{formatRupiah(t.amount)}</td>
                    </tr>
                  ))}
                  {compliance.insurances.map((ins, i) => (
                    <tr key={`ins-${i}`}>
                      <td><span className="badge badge-purple">Asuransi</span></td>
                      <td className="text-gray-700">{ins.type}{ins.provider ? ` · ${ins.provider}` : ''}</td>
                      <td className="text-gray-700">{formatDate(ins.endDate)}</td>
                      <td className="text-center font-mono tabular-nums text-gray-700">{ins.daysRemaining ?? '—'}</td>
                      <td className="text-center"><span className={`badge ${STATE_BADGE[ins.state]}`}>{STATE_LABEL[ins.state]}</span></td>
                      <td className="text-right font-mono tabular-nums text-gray-900">{formatRupiah(ins.premium)}</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insiden terbuka */}
      {compliance.openIncidents.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <TriangleAlert size={16} className="text-orange-600" /> Insiden Belum Selesai
            </h2>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Tanggal</th><th>Deskripsi</th><th className="text-center">Tingkat</th><th className="text-center">Status</th><th className="text-right">Estimasi Biaya</th></tr>
              </thead>
              <tbody>
                {compliance.openIncidents.map((inc, i) => (
                  <tr key={i}>
                    <td className="text-gray-700">{formatDate(inc.tanggal)}</td>
                    <td className="text-gray-700">{inc.description ?? '—'}</td>
                    <td className="text-center"><span className="badge badge-amber">{inc.severity}</span></td>
                    <td className="text-center"><span className="badge badge-gray">{inc.status}</span></td>
                    <td className="text-right font-mono tabular-nums text-gray-900">{formatRupiah(inc.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kondisi fisik */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ClipboardCheck size={16} className="text-teal-600" /> Inspeksi & Oli
          </h2>
          <div className="space-y-3 text-sm">
            {condition.lastInspection ? (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Inspeksi Terakhir</p>
                  <p className="text-gray-800">{formatDate(condition.lastInspection.tanggal)}</p>
                  {condition.lastInspection.notes && <p className="text-xs text-gray-500 mt-0.5">{condition.lastInspection.notes}</p>}
                </div>
                <span className="badge badge-gray shrink-0">{condition.lastInspection.overallResult}</span>
              </div>
            ) : (
              <p className="text-gray-400">Belum ada catatan inspeksi.</p>
            )}
            <div className="border-t border-gray-100 pt-3">
              {condition.lastOil ? (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Ganti Oli Terakhir</p>
                    <p className="text-gray-800">
                      {formatDate(condition.lastOil.tanggal)} · {numberFmt(condition.lastOil.odometer)} km
                      {condition.lastOil.brand ? ` · ${condition.lastOil.brand}` : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Jadwal berikutnya {numberFmt(condition.lastOil.nextOdometerDue)} km
                      {condition.lastOil.remainingKm != null && ` · sisa ${numberFmt(condition.lastOil.remainingKm)} km`}
                    </p>
                  </div>
                  {condition.lastOil.isDue != null && (
                    <span className={`badge shrink-0 ${condition.lastOil.isDue ? 'badge-red' : 'badge-green'}`}>
                      {condition.lastOil.isDue ? 'Jatuh Tempo' : 'Aman'}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-gray-400">Belum ada log penggantian oli.</p>
              )}
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CircleDot size={16} className="text-teal-600" /> Ban Terpasang ({condition.activeTireCount})
          </h2>
          {condition.activeTires.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada data ban terpasang.</p>
          ) : (
            <div className="space-y-2">
              {condition.activeTires.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="text-gray-800 font-medium">{t.position}</p>
                    <p className="text-xs text-gray-500">
                      {t.brand ?? '—'}{t.serialNumber ? ` · ${t.serialNumber}` : ''} · pasang {formatDate(t.installedAt)}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs text-gray-600">
                    {t.usageKm != null ? `${numberFmt(t.usageKm)} km` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportKpi({ icon, iconBg, label, value, sub }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub?: string;
}) {
  return (
    <div className="card p-3.5">
      <div className="flex items-start gap-2.5">
        <div className={cn('p-1.5 rounded-lg shrink-0', iconBg)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
          <p className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('font-medium text-gray-800', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}
