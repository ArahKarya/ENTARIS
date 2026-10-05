import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Calculator, ChevronDown, ChevronRight, Factory, Layers, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ComboboxFilter } from '@/components/shared';
import { focusRing } from '@/components/ui/styles';
import {
  ExportMenu,
  ReportDataTable,
  ReportFilters,
  ReportNotice,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  TOTAL_ROW_CLASS,
  periodLabel,
  toIso,
  useReportRange,
  type DataColumn,
} from '@/components/report-kit';

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

const fmt0 = (n: number) => formatNumber(Number(n));
const fmt2 = (n: number) => formatNumber(Number(n), { decimals: 2 });
const groupKey = (g: { outputName: string; warehouseName: string }) => `${g.outputName}|${g.warehouseName}`;
const RAW_CELL = 'bg-info-subtle/40';

/** GL minus pure-material cost per kg; sign is printed, colour only reinforces it. */
function DiffCell({ gl, raw }: { gl: number; raw: number }) {
  const d = gl - raw;
  return (
    <span className={cn('num', d > 0 ? 'text-danger-text' : d < 0 ? 'text-success-text' : 'text-muted-foreground')}>
      {d > 0 ? '+' : d < 0 ? '−' : ''}
      {fmt2(Math.abs(d))}
    </span>
  );
}

function ByproductCell({ kg, flagZero }: { kg: number; flagZero?: boolean }) {
  if (flagZero && kg === 0) {
    return (
      <span className="inline-flex items-center justify-end gap-1 font-medium text-warning-text">
        <AlertTriangle className="size-3.5" aria-hidden />
        0<span className="sr-only"> (tanpa produk samping tercatat)</span>
      </span>
    );
  }
  return <>{fmt0(kg)}</>;
}

const metricColumns = (): DataColumn<Row>[] => [
  { key: 'runs', header: 'Run', numeric: true, render: (g) => g.runCount },
  { key: 'inKg', header: 'Bahan (kg)', numeric: true, render: (g) => fmt0(g.inputKg) },
  { key: 'inRp', header: 'Nilai Bahan Real', numeric: true, render: (g) => fmt0(g.inputRp) },
  { key: 'inPer', header: 'Modal Bahan/kg', numeric: true, render: (g) => fmt2(g.inputPerKg) },
  { key: 'outKg', header: 'Output (kg)', numeric: true, render: (g) => fmt0(g.mainKg) },
  { key: 'yield', header: 'Rendemen', numeric: true, render: (g) => `${fmt2(g.yieldPct)}%` },
  { key: 'raw', header: 'Modal Murni/kg', numeric: true, className: cn(RAW_CELL, 'font-bold'), render: (g) => fmt2(g.rawMaterialPerKg) },
  { key: 'gl', header: 'HPP GL/kg', numeric: true, render: (g) => fmt2(g.glPerKg) },
  { key: 'diff', header: 'Selisih/kg', numeric: true, render: (g) => <DiffCell gl={g.glPerKg} raw={g.rawMaterialPerKg} /> },
  { key: 'by', header: 'Produk Samping (kg)', numeric: true, render: (g) => <ByproductCell kg={g.byproductKg} /> },
];

export default function ProductionCostSummary() {
  const now = new Date();
  const { startDate, endDate, setRange } = useReportRange({
    startDate: toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: toIso(now),
  });
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

  const { data, isLoading, isError, refetch } = useQuery<ReportData>({
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
      const k = groupKey(r);
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

  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const columns: DataColumn<Row>[] = [
    {
      key: 'output',
      header: 'Jenis Output',
      rowHeader: true,
      render: (g) => {
        const key = groupKey(g);
        const isOpen = !!open[key];
        return (
          <button
            type="button"
            onClick={() => toggle(key)}
            aria-expanded={isOpen}
            aria-label={`Rincian per nomor produksi, ${g.outputName}, ${g.warehouseName}`}
            className={cn('-ml-1 inline-flex min-h-8 items-center gap-1 rounded-sm px-1 text-left max-sm:min-h-11', focusRing)}
          >
            {isOpen ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
            {g.outputName}
          </button>
        );
      },
    },
    { key: 'wh', header: 'Gudang', className: 'whitespace-nowrap text-xs text-muted-foreground', render: (g) => g.warehouseName },
    ...metricColumns(),
  ];

  const renderRuns = (g: Row) => {
    const key = groupKey(g);
    if (!open[key]) return null;
    return (runsByGroup.get(key) ?? []).map((r) => (
      <tr key={r.runId} className="border-b border-border bg-muted/40 text-xs">
        <th scope="row" className="py-2 pl-8 pr-4 text-left font-mono font-normal max-sm:pr-3">{r.runNumber}</th>
        <td className="px-4 py-2 text-muted-foreground max-sm:px-3">
          {new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
        </td>
        <td aria-hidden="true" />
        <td className="num px-4 py-2 text-right max-sm:px-3">{fmt0(r.inputKg)}</td>
        <td className="num px-4 py-2 text-right max-sm:px-3">{fmt0(r.inputRp)}</td>
        <td className="num px-4 py-2 text-right max-sm:px-3">{fmt2(r.inputPerKg)}</td>
        <td className="num px-4 py-2 text-right max-sm:px-3">{fmt0(r.mainKg)}</td>
        <td className="num px-4 py-2 text-right max-sm:px-3">{fmt2(r.yieldPct)}%</td>
        <td className={cn('num px-4 py-2 text-right max-sm:px-3', RAW_CELL)}>{fmt2(r.rawMaterialPerKg)}</td>
        <td className="num px-4 py-2 text-right max-sm:px-3">{fmt2(r.glPerKg)}</td>
        <td className="px-4 py-2 text-right max-sm:px-3"><DiffCell gl={r.glPerKg} raw={r.rawMaterialPerKg} /></td>
        <td className="num px-4 py-2 text-right max-sm:px-3"><ByproductCell kg={r.byproductKg} flagZero /></td>
      </tr>
    ));
  };

  const t = data?.total;
  const total = t && (
    <tr className={TOTAL_ROW_CLASS}>
      <th scope="row" className="px-4 py-2.5 text-left max-sm:px-3">TOTAL</th>
      <td aria-hidden="true" />
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{t.runCount}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt0(t.inputKg)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt0(t.inputRp)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt2(t.inputPerKg)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt0(t.mainKg)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt2(t.yieldPct)}%</td>
      <td className={cn('num px-4 py-2.5 text-right max-sm:px-3', RAW_CELL)}>{fmt2(t.rawMaterialPerKg)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt2(t.glPerKg)}</td>
      <td className="px-4 py-2.5 text-right max-sm:px-3"><DiffCell gl={t.glPerKg} raw={t.rawMaterialPerKg} /></td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt0(t.byproductKg)}</td>
    </tr>
  );

  const hasRuns = !!t && t.runCount > 0;

  return (
    <ReportPage
      title="Modal Produksi per Periode"
      description="Modal bahan baku murni dan HPP GL per kg output, per jenis dan gudang"
      period={periodLabel({ startDate, endDate })}
      actions={<ExportMenu onExcel={handleExport} disabled={isLoading || isError || !data || data.summary.length === 0} />}
      filters={
        <div className="flex flex-col gap-3">
          <ReportNotice tone="info">
            <p className="font-medium">Dua cara baca modal</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              <li><strong>Modal Bahan Baku Murni/kg</strong> = nilai bahan baku real (pembelian) dibagi kg output utama. Tanpa biaya estimasi dan produk samping. Laporan manajemen, tidak diposting ke GL.</li>
              <li><strong>HPP GL/kg</strong> = nilai yang diposting ke persediaan = bahan − NRV produk samping + biaya konversi estimasi (sesuai PSAK 14).</li>
              <li>Selisih bertanda <strong>+</strong> = HPP GL lebih tinggi (biaya estimasi lebih besar dari nilai produk samping); <strong>−</strong> = sebaliknya.</li>
            </ul>
          </ReportNotice>
          <ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange}>
            <ComboboxFilter
              label="Gudang output"
              value={warehouseId}
              onChange={setWarehouseId}
              options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
              allLabel="Semua gudang"
              searchPlaceholder="Cari gudang…"
              className="w-full sm:w-56"
            />
          </ReportFilters>
        </div>
      }
      summary={
        hasRuns && t ? (
          <ReportSummaryCards
            items={[
              { label: 'Produksi', value: t.runCount, formatted: `${t.runCount} run`, icon: Factory, hint: `${fmt0(t.inputKg)} kg bahan → ${fmt0(t.mainKg)} kg` },
              { label: 'Nilai Bahan Real', value: t.inputRp, icon: Wallet, tone: 'neutral', hint: `${formatRupiah(t.inputPerKg, { decimals: 2 })}/kg bahan` },
              { label: 'Modal Bahan Baku Murni', value: t.rawMaterialPerKg, formatted: `${formatRupiah(t.rawMaterialPerKg, { decimals: 2 })}/kg`, icon: Layers, tone: 'neutral', hint: `rendemen ${fmt2(t.yieldPct)}% (campuran)` },
              { label: 'HPP GL', value: t.glPerKg, formatted: `${formatRupiah(t.glPerKg, { decimals: 2 })}/kg`, icon: Calculator, tone: 'neutral', hint: <>selisih <DiffCell gl={t.glPerKg} raw={t.rawMaterialPerKg} />/kg dari modal murni</> },
            ]}
          />
        ) : undefined
      }
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={!!data && data.summary.length === 0} onRetry={() => refetch()}>
        <ReportDataTable
          caption={`Modal produksi per jenis output dan gudang, ${periodLabel({ startDate, endDate })}`}
          columns={columns}
          rows={data?.summary ?? []}
          getRowKey={groupKey}
          afterRow={renderRuns}
          footer={total}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Pilih jenis output untuk melihat rincian per nomor produksi. Ikon peringatan = produksi tanpa produk samping tercatat (periksa input).
          Total adalah campuran semua jenis/gudang; bandingkan per baris untuk keputusan.
        </p>
      </ReportState>
    </ReportPage>
  );
}
