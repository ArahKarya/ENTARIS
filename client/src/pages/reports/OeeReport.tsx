import { useQuery } from '@tanstack/react-query';
import { Activity, Clock, Cog, Gauge, Layers } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CHART_AXIS_TICK,
  CHART_GRID_STROKE,
  CHART_TOOLTIP_STYLE,
  ChartFigure,
  ExportMenu,
  ReportDataTable,
  ReportFilters,
  ReportNotice,
  ReportPage,
  ReportSection,
  ReportState,
  ReportSummaryCards,
  SERIES_STYLES,
  periodLabel,
  seriesDot,
  toIso,
  useReportRange,
  type ChartLegendItem,
  type DataColumn,
  type SummaryItem,
} from '@/components/report-kit';
import { useChartAnimation } from '@/contexts/motion-context';

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

const WORLD_CLASS = 85;

const fmtPct = (n: number) => `${Number(n).toFixed(1)}%`;
const fmtNum = (n: number, decimals = 1) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: decimals });
const fmtMinutes = (min: number) => {
  if (min <= 0) return '0 menit';
  return `${fmtNum(min, 0)} menit (${fmtNum(min / 60, 1)} jam)`;
};

// OEE band: >= 85 world-class, >= 60 sedang, < 60 rendah. Always shown as text too.
const oeeBand = (pct: number) =>
  pct >= WORLD_CLASS
    ? { label: 'Kelas dunia', cls: 'text-success-text' }
    : pct >= 60
      ? { label: 'Sedang', cls: 'text-warning-text' }
      : { label: 'Rendah', cls: 'text-danger-text' };

function OeeCell({ pct }: { pct: number }) {
  const band = oeeBand(pct);
  return (
    <span className={cn('font-semibold', band.cls)}>
      {fmtPct(pct)}
      <span className="block text-xs font-normal">{band.label}</span>
    </span>
  );
}

const MACHINE_COLUMNS: DataColumn<MachineRow>[] = [
  { key: 'code', header: 'Kode', className: 'whitespace-nowrap font-mono text-xs', render: (m) => m.code || '—' },
  { key: 'name', header: 'Nama', rowHeader: true, render: (m) => m.name || '—' },
  { key: 'runs', header: 'Run', numeric: true, render: (m) => fmtNum(m.runs, 0) },
  { key: 'av', header: 'Avail.', numeric: true, render: (m) => fmtPct(m.avgAvailability) },
  { key: 'pf', header: 'Perf.', numeric: true, render: (m) => fmtPct(m.avgPerformance) },
  { key: 'ql', header: 'Qual.', numeric: true, render: (m) => fmtPct(m.avgQuality) },
  { key: 'oee', header: 'OEE', numeric: true, render: (m) => <OeeCell pct={m.avgOee} /> },
  { key: 'run', header: 'Jam Jalan', numeric: true, className: 'whitespace-nowrap', render: (m) => `${fmtNum(m.totalRunMin / 60, 1)} jam` },
  { key: 'dt', header: 'Downtime', numeric: true, className: 'whitespace-nowrap', render: (m) => `${fmtNum(m.totalDowntimeMin, 0)} mnt` },
  { key: 'qty', header: 'Output Alokasi', numeric: true, render: (m) => fmtNum(m.totalAllocatedQty, 1) },
];

const SHIFT_COLUMNS: DataColumn<ShiftRow>[] = [
  { key: 'shift', header: 'Shift', rowHeader: true, render: (s) => s.shift },
  { key: 'runs', header: 'Run', numeric: true, render: (s) => fmtNum(s.runs, 0) },
  { key: 'av', header: 'Avail.', numeric: true, render: (s) => fmtPct(s.avgAvailability) },
  { key: 'pf', header: 'Perf.', numeric: true, render: (s) => fmtPct(s.avgPerformance) },
  { key: 'ql', header: 'Qual.', numeric: true, render: (s) => fmtPct(s.avgQuality) },
  { key: 'oee', header: 'OEE', numeric: true, render: (s) => <OeeCell pct={s.avgOee} /> },
];

const TREND_COLUMNS: DataColumn<TrendRow>[] = [
  { key: 'date', header: 'Tanggal', rowHeader: true, className: 'whitespace-nowrap', render: (t) => t.date },
  { key: 'runs', header: 'Run', numeric: true, render: (t) => fmtNum(t.runs, 0) },
  { key: 'oee', header: 'OEE', numeric: true, render: (t) => fmtPct(t.avgOee) },
  { key: 'av', header: 'Availability', numeric: true, render: (t) => fmtPct(t.avgAvailability) },
  { key: 'pf', header: 'Performance', numeric: true, render: (t) => fmtPct(t.avgPerformance) },
  { key: 'ql', header: 'Quality', numeric: true, render: (t) => fmtPct(t.avgQuality) },
];

const [OEE_STYLE, AVAIL_STYLE, PERF_STYLE, QUAL_STYLE] = SERIES_STYLES;

function trendSummary(trend: ReadonlyArray<TrendRow>): string {
  if (trend.length === 0) return 'Tidak ada data OEE pada periode ini.';
  const best = trend.reduce((a, b) => (b.avgOee > a.avgOee ? b : a));
  const worst = trend.reduce((a, b) => (b.avgOee < a.avgOee ? b : a));
  return `Tren OEE harian selama ${trend.length} hari. Tertinggi ${fmtPct(best.avgOee)} pada ${best.date}, terendah ${fmtPct(worst.avgOee)} pada ${worst.date}. Garis putus-putus di 85% menandai patokan kelas dunia (Nakajima, JIPM).`;
}

function OeeTrendChart({ trend, summary }: { trend: TrendRow[]; summary: OeeSummary }) {
  const animate = useChartAnimation();
  const legend: ChartLegendItem[] = [
    { name: 'OEE', style: OEE_STYLE, value: `rata-rata ${fmtPct(summary.avgOee)}` },
    { name: 'Availability', style: AVAIL_STYLE, value: `rata-rata ${fmtPct(summary.avgAvailability)}` },
    { name: 'Performance', style: PERF_STYLE, value: `rata-rata ${fmtPct(summary.avgPerformance)}` },
    { name: 'Quality', style: QUAL_STYLE, value: `rata-rata ${fmtPct(summary.avgQuality)}` },
  ];
  return (
    <ChartFigure
      title="Tren OEE harian"
      summary={trendSummary(trend)}
      legend={legend}
      table={
        <ReportDataTable
          caption="Data tren OEE harian"
          columns={TREND_COLUMNS}
          rows={trend}
          getRowKey={(t) => t.date}
          maxHeightClass="max-h-80"
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={trend} margin={{ top: 10, right: 12, left: -16, bottom: 0 }} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="date"
            tick={CHART_AXIS_TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(5) : v)}
          />
          <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <ReferenceLine
            y={WORLD_CLASS}
            stroke="var(--muted-foreground)"
            strokeDasharray="1 5"
            label={{ value: 'Kelas dunia 85%', position: 'insideBottomRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
            labelFormatter={(label, payload) => `${label} · ${payload?.[0]?.payload?.runs ?? 0} run`}
          />
          <Line type="monotone" dataKey="avgOee" name="OEE" stroke={OEE_STYLE.color} strokeWidth={OEE_STYLE.width} dot={seriesDot(OEE_STYLE)} isAnimationActive={animate} />
          <Line type="monotone" dataKey="avgAvailability" name="Availability" stroke={AVAIL_STYLE.color} strokeWidth={AVAIL_STYLE.width} strokeDasharray={AVAIL_STYLE.dash} dot={seriesDot(AVAIL_STYLE, 3)} isAnimationActive={animate} />
          <Line type="monotone" dataKey="avgPerformance" name="Performance" stroke={PERF_STYLE.color} strokeWidth={PERF_STYLE.width} strokeDasharray={PERF_STYLE.dash} dot={seriesDot(PERF_STYLE, 3)} isAnimationActive={animate} />
          <Line type="monotone" dataKey="avgQuality" name="Quality" stroke={QUAL_STYLE.color} strokeWidth={QUAL_STYLE.width} strokeDasharray={QUAL_STYLE.dash} dot={seriesDot(QUAL_STYLE, 3)} isAnimationActive={animate} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

function DowntimePareto({ downtime }: { downtime: DowntimeRow[] }) {
  const total = downtime.reduce((s, d) => s + d.totalMin, 0);
  const max = downtime.length > 0 ? downtime[0].totalMin : 1;
  const rows = downtime.map((d, i) => {
    const cum = downtime.slice(0, i + 1).reduce((s, x) => s + x.totalMin, 0);
    return { ...d, cumulativePct: total > 0 ? Math.round((cum / total) * 1000) / 10 : 0 };
  });
  return (
    <ol className="space-y-3" aria-label="Downtime per kategori, urut dari terbesar">
      {rows.map((d) => (
        <li key={d.category}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-xs">
            <span className="font-medium text-foreground">{d.category}</span>
            <span className="num text-muted-foreground">
              {fmtNum(d.totalMin, 0)} mnt · {d.count}x · kum {d.cumulativePct}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-muted" aria-hidden>
            <div className="h-full rounded-sm bg-danger" style={{ width: `${max > 0 ? Math.max(4, (d.totalMin / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function oeeCards(s: OeeSummary): { main: SummaryItem[]; other: SummaryItem[] } {
  const band = oeeBand(s.avgOee);
  return {
    main: [
      {
        label: 'OEE',
        value: s.avgOee,
        formatted: fmtPct(s.avgOee),
        icon: Gauge,
        hint: band.label,
        tone: s.avgOee >= WORLD_CLASS ? 'positive' : s.avgOee < 60 ? 'negative' : 'neutral',
      },
      { label: 'Availability', value: s.avgAvailability, formatted: fmtPct(s.avgAvailability), icon: Activity, tone: 'neutral' },
      { label: 'Performance', value: s.avgPerformance, formatted: fmtPct(s.avgPerformance), icon: Activity, tone: 'neutral' },
      { label: 'Quality', value: s.avgQuality, formatted: fmtPct(s.avgQuality), icon: Activity, tone: 'neutral' },
    ],
    other: [
      { label: 'Total Run', value: s.totalRuns, formatted: fmtNum(s.totalRuns, 0), icon: Layers, tone: 'neutral', hint: `${s.runsWithOee} run dengan OEE` },
      { label: 'Total Downtime', value: s.totalDowntimeMin, formatted: fmtMinutes(s.totalDowntimeMin), icon: Clock, tone: 'neutral' },
      { label: 'Mesin Dipakai', value: s.machinesUsed, formatted: fmtNum(s.machinesUsed, 0), icon: Cog, tone: 'neutral' },
    ],
  };
}

export default function OeeReport() {
  const now = new Date();
  const { startDate, endDate, setRange } = useReportRange({
    startDate: toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: toIso(now),
  });

  const { data, isLoading, isError, refetch } = useQuery<OeeReportData>({
    queryKey: ['report-oee', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/inventory/dashboard/oee', { params: { startDate, endDate } });
      return res.data;
    },
  });

  const summary = data?.summary;
  const cards = summary ? oeeCards(summary) : null;

  return (
    <ReportPage
      title="Laporan OEE"
      description="Efektivitas mesin: availability, performance, quality, dan downtime"
      period={periodLabel({ startDate, endDate })}
      actions={<ExportMenu disabled={isLoading || isError} />}
      filters={
        <div className="flex flex-col gap-3">
          <ReportNotice tone="info">
            <strong>OEE (Overall Equipment Effectiveness)</strong> = Availability × Performance × Quality. Semua angka adalah{' '}
            <strong>rata-rata</strong> dari nilai per run yang tercatat dalam periode. Patokan kelas dunia 85% mengikuti Nakajima (JIPM).
          </ReportNotice>
          <ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange} />
        </div>
      }
      summary={
        cards ? (
          <div className="space-y-3">
            <ReportSummaryCards label="Ringkasan OEE" items={cards.main} />
            <ReportSummaryCards label="Ringkasan produksi" items={cards.other} />
          </div>
        ) : undefined
      }
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={!summary && !isLoading} onRetry={() => refetch()}>
        {data && summary && (
          <div className="space-y-5">
            <ReportSection title="Tren OEE Harian" icon={Gauge}>
              {data.trend.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada run produksi dengan data OEE pada periode ini. Ubah periode di atas.</p>
              ) : (
                <OeeTrendChart trend={data.trend} summary={summary} />
              )}
            </ReportSection>

            <ReportSection title="Per Mesin" icon={Cog} flush>
              <ReportDataTable
                variant="bare"
                caption="OEE per mesin"
                columns={MACHINE_COLUMNS}
                rows={data.perMachine}
                getRowKey={(m) => m.machineId}
                emptyText="Tidak ada run yang tercatat per mesin pada periode ini."
                maxHeightClass="max-h-[60vh]"
              />
            </ReportSection>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <ReportSection title="Per Shift" icon={Layers} flush>
                <ReportDataTable
                  variant="bare"
                  caption="OEE per shift"
                  columns={SHIFT_COLUMNS}
                  rows={data.perShift}
                  getRowKey={(s) => s.shift}
                  emptyText="Tidak ada run yang tercatat per shift pada periode ini."
                />
              </ReportSection>
              <ReportSection title="Downtime per Kategori (Pareto)" icon={Clock}>
                {data.downtimeByCategory.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada downtime yang dicatat pada periode ini.</p>
                ) : (
                  <DowntimePareto downtime={data.downtimeByCategory} />
                )}
              </ReportSection>
            </div>
          </div>
        )}
      </ReportState>
    </ReportPage>
  );
}
