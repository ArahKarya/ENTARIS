import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Info, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { cn } from '../../lib/utils';
import Select from '../../components/Select';
import { exportToExcel } from '../../lib/exportExcel';

interface Row {
  outputName: string;
  warehouseName: string;
  runCount: number;
  inputKg: number;
  inputRp: number;
  mainKg: number;
  mainRp: number;
  byproductKg: number;
  byproductRp: number;
  conversionCostRp: number;
  yieldPct: number;
  inputPerKg: number;
  rawMaterialPerKg: number;
  glPerKg: number;
}

interface RunRow extends Omit<Row, 'runCount'> {
  runId: string;
  runNumber: string;
  date: string;
}

interface ReportData {
  period: { start: string; end: string };
  summary: Row[];
  total: Row;
  runs: RunRow[];
}

const fmt0 = (n: number) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const fmt2 = (n: number) => Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().substring(0, 10);
};

export default function ProductionCostSummary() {
  const now = new Date();
  const [startDate, setStartDate] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toISO(now));
  const [warehouseId, setWarehouseId] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data: warehouses } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses?active=true');
      const list = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      return list;
    },
  });

  const { data, isLoading, isError } = useQuery<ReportData>({
    queryKey: ['report-production-cost-summary', startDate, endDate, warehouseId],
    queryFn: async () => {
      const res = await api.get('/reports/production-cost-summary', {
        params: { startDate, endDate, warehouseId: warehouseId || undefined },
      });
      return res.data;
    },
  });

  const runsByGroup = useMemo(() => {
    const m = new Map<string, RunRow[]>();
    for (const r of data?.runs ?? []) {
      const k = `${r.outputName}|${r.warehouseName}`;
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [data]);

  const handleExport = async () => {
    if (!data) return;
    const rows = [
      ...data.summary.map((g) => ({
        Jenis: g.outputName,
        Gudang: g.warehouseName,
        'Jml Produksi': g.runCount,
        'Bahan (kg)': Math.round(g.inputKg),
        'Nilai Bahan Real (Rp)': Math.round(g.inputRp),
        'Modal Bahan/kg': +g.inputPerKg.toFixed(2),
        'Output (kg)': Math.round(g.mainKg),
        'Rendemen (%)': +g.yieldPct.toFixed(2),
        'Modal Bahan Baku Murni/kg': +g.rawMaterialPerKg.toFixed(2),
        'HPP GL/kg': +g.glPerKg.toFixed(2),
        'Selisih GL − Murni/kg': +(g.glPerKg - g.rawMaterialPerKg).toFixed(2),
        'Produk Samping (kg)': Math.round(g.byproductKg),
        'Nilai Produk Samping (Rp)': Math.round(g.byproductRp),
        'Biaya Konversi Estimasi (Rp)': Math.round(g.conversionCostRp),
      })),
      {
        Jenis: 'TOTAL', Gudang: '', 'Jml Produksi': data.total.runCount,
        'Bahan (kg)': Math.round(data.total.inputKg), 'Nilai Bahan Real (Rp)': Math.round(data.total.inputRp),
        'Modal Bahan/kg': +data.total.inputPerKg.toFixed(2), 'Output (kg)': Math.round(data.total.mainKg),
        'Rendemen (%)': +data.total.yieldPct.toFixed(2), 'Modal Bahan Baku Murni/kg': +data.total.rawMaterialPerKg.toFixed(2),
        'HPP GL/kg': +data.total.glPerKg.toFixed(2), 'Selisih GL − Murni/kg': +(data.total.glPerKg - data.total.rawMaterialPerKg).toFixed(2),
        'Produk Samping (kg)': Math.round(data.total.byproductKg), 'Nilai Produk Samping (Rp)': Math.round(data.total.byproductRp),
        'Biaya Konversi Estimasi (Rp)': Math.round(data.total.conversionCostRp),
      },
    ];
    await exportToExcel(rows, `modal-produksi_${startDate}_${endDate}`);
  };

  const diffCell = (gl: number, raw: number) => {
    const d = gl - raw;
    return (
      <span className={cn('tabular-nums', d > 0 ? 'text-red-600' : d < 0 ? 'text-green-700' : 'text-gray-500')}>
        {d > 0 ? '+' : d < 0 ? '−' : ''}{fmt2(Math.abs(d))}
      </span>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/reports" className="p-1.5 hover:bg-gray-100 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Modal Produksi per Periode
        </h1>
      </div>

      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <strong>Dua cara baca modal:</strong>
          <ul className="text-blue-700 mt-1 space-y-0.5 list-disc list-inside text-xs">
            <li><strong>Modal Bahan Baku Murni/kg</strong> = nilai bahan baku real (pembelian) ÷ kg output utama. Tanpa biaya estimasi &amp; produk samping. Laporan manajemen — tidak diposting ke GL.</li>
            <li><strong>HPP GL/kg</strong> = nilai yang diposting ke persediaan = bahan − NRV produk samping + biaya konversi estimasi (sesuai PSAK 14).</li>
            <li>Selisih <span className="text-red-600">+</span> = HPP GL lebih tinggi (biaya estimasi &gt; nilai produk samping); <span className="text-green-700">−</span> = sebaliknya.</li>
          </ul>
        </div>
      </div>

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
        <div className="min-w-[220px]">
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Gudang Output</label>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full">
            <option value="">Semua gudang</option>
            {(warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>
        <button onClick={handleExport} disabled={!data || data.summary.length === 0}
          className="btn-secondary text-sm py-2 px-3 flex items-center gap-2 ml-auto disabled:opacity-50">
          <Download size={14} /> Excel
        </button>
      </div>

      {data && data.total.runCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Produksi</p>
            <p className="text-lg font-bold mt-1">{data.total.runCount} run</p>
            <p className="text-[11px] text-gray-500">{fmt0(data.total.inputKg)} kg bahan → {fmt0(data.total.mainKg)} kg</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Nilai Bahan Real</p>
            <p className="text-lg font-bold mt-1">Rp {fmt0(data.total.inputRp)}</p>
            <p className="text-[11px] text-gray-500">Rp {fmt2(data.total.inputPerKg)}/kg bahan</p>
          </div>
          <div className="card p-4 border-2 border-sky-200 bg-sky-50/40">
            <p className="text-xs font-medium text-sky-700">Modal Bahan Baku Murni</p>
            <p className="text-lg font-bold mt-1 text-sky-900">Rp {fmt2(data.total.rawMaterialPerKg)}/kg</p>
            <p className="text-[11px] text-sky-700">rendemen {fmt2(data.total.yieldPct)}% (campuran semua jenis)</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>HPP GL</p>
            <p className="text-lg font-bold mt-1">Rp {fmt2(data.total.glPerKg)}/kg</p>
            <p className="text-[11px]">selisih {diffCell(data.total.glPerKg, data.total.rawMaterialPerKg)}/kg</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Memuat...</div>
      ) : isError ? (
        <div className="card p-8 text-center text-red-600">Gagal memuat laporan.</div>
      ) : data && data.summary.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Jenis Output</th>
                  <th>Gudang</th>
                  <th className="text-right">Run</th>
                  <th className="text-right">Bahan (kg)</th>
                  <th className="text-right">Nilai Bahan Real</th>
                  <th className="text-right">Modal Bahan/kg</th>
                  <th className="text-right">Output (kg)</th>
                  <th className="text-right">Rendemen</th>
                  <th className="text-right bg-sky-50">Modal Murni/kg</th>
                  <th className="text-right">HPP GL/kg</th>
                  <th className="text-right">Selisih/kg</th>
                  <th className="text-right">Produk Samping (kg)</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.map((g) => {
                  const key = `${g.outputName}|${g.warehouseName}`;
                  const isOpen = !!open[key];
                  const runs = runsByGroup.get(key) ?? [];
                  return [
                    <tr key={key} className="cursor-pointer hover:bg-gray-50" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
                      <td className="font-medium">
                        <span className="inline-flex items-center gap-1">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {g.outputName}
                        </span>
                      </td>
                      <td className="text-xs text-gray-600">{g.warehouseName}</td>
                      <td className="text-right tabular-nums">{g.runCount}</td>
                      <td className="text-right tabular-nums">{fmt0(g.inputKg)}</td>
                      <td className="text-right tabular-nums">{fmt0(g.inputRp)}</td>
                      <td className="text-right tabular-nums">{fmt2(g.inputPerKg)}</td>
                      <td className="text-right tabular-nums">{fmt0(g.mainKg)}</td>
                      <td className="text-right tabular-nums">{fmt2(g.yieldPct)}%</td>
                      <td className="text-right tabular-nums font-bold text-sky-900 bg-sky-50">{fmt2(g.rawMaterialPerKg)}</td>
                      <td className="text-right tabular-nums">{fmt2(g.glPerKg)}</td>
                      <td className="text-right">{diffCell(g.glPerKg, g.rawMaterialPerKg)}</td>
                      <td className="text-right tabular-nums">{fmt0(g.byproductKg)}</td>
                    </tr>,
                    ...(isOpen ? runs.map((r) => (
                      <tr key={r.runId} className="bg-gray-50/60 text-xs">
                        <td className="pl-8 font-mono">{r.runNumber}</td>
                        <td className="text-gray-500">{new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</td>
                        <td />
                        <td className="text-right tabular-nums">{fmt0(r.inputKg)}</td>
                        <td className="text-right tabular-nums">{fmt0(r.inputRp)}</td>
                        <td className="text-right tabular-nums">{fmt2(r.inputPerKg)}</td>
                        <td className="text-right tabular-nums">{fmt0(r.mainKg)}</td>
                        <td className="text-right tabular-nums">{fmt2(r.yieldPct)}%</td>
                        <td className="text-right tabular-nums bg-sky-50">{fmt2(r.rawMaterialPerKg)}</td>
                        <td className="text-right tabular-nums">{fmt2(r.glPerKg)}</td>
                        <td className="text-right">{diffCell(r.glPerKg, r.rawMaterialPerKg)}</td>
                        <td className={cn('text-right tabular-nums', r.byproductKg === 0 && 'text-amber-600 font-medium')}>
                          {r.byproductKg === 0 ? '0 ⚠' : fmt0(r.byproductKg)}
                        </td>
                      </tr>
                    )) : []),
                  ];
                })}
                <tr className="font-bold bg-gray-100">
                  <td>TOTAL</td>
                  <td />
                  <td className="text-right tabular-nums">{data.total.runCount}</td>
                  <td className="text-right tabular-nums">{fmt0(data.total.inputKg)}</td>
                  <td className="text-right tabular-nums">{fmt0(data.total.inputRp)}</td>
                  <td className="text-right tabular-nums">{fmt2(data.total.inputPerKg)}</td>
                  <td className="text-right tabular-nums">{fmt0(data.total.mainKg)}</td>
                  <td className="text-right tabular-nums">{fmt2(data.total.yieldPct)}%</td>
                  <td className="text-right tabular-nums text-sky-900 bg-sky-50">{fmt2(data.total.rawMaterialPerKg)}</td>
                  <td className="text-right tabular-nums">{fmt2(data.total.glPerKg)}</td>
                  <td className="text-right">{diffCell(data.total.glPerKg, data.total.rawMaterialPerKg)}</td>
                  <td className="text-right tabular-nums">{fmt0(data.total.byproductKg)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] px-4 py-2 text-gray-500">
            Klik baris untuk rincian per nomor produksi. ⚠ = produksi tanpa produk samping tercatat (cek input).
            Total campuran semua jenis/gudang — bandingkan per baris untuk keputusan.
          </p>
        </div>
      ) : (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Tidak ada produksi di periode ini.
        </div>
      )}
    </div>
  );
}
