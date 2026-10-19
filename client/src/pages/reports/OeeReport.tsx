import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import i18n from '@/i18n';
import { formatNumber } from '@/lib/format';
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
const fmtNum = (n: number, decimals = 1) => formatNumber(Number(n), { maxDecimals: decimals });
const fmtMinutes = (min: number) => {
  if (min <= 0) return i18n.t('oeeReport.minutes', { ns: 'reports', value: '0' });
  return i18n.t('oeeReport.minutesHours', { ns: 'reports', minutes: fmtNum(min, 0), hours: fmtNum(min / 60, 1) });
};

type T = TFunction<'reports'>;

// OEE band: >= 85 world-class, >= 60 sedang, < 60 rendah. Always shown as text too.
const oeeBand = (pct: number) =>
  pct >= WORLD_CLASS
    ? { label: i18n.t('oeeReport.band.worldClass', { ns: 'reports' }), cls: 'text-success-text' }
    : pct >= 60
      ? { label: i18n.t('oeeReport.band.medium', { ns: 'reports' }), cls: 'text-warning-text' }
      : { label: i18n.t('oeeReport.band.low', { ns: 'reports' }), cls: 'text-danger-text' };

function OeeCell({ pct }: { pct: number }) {
  const band = oeeBand(pct);
  return (
    <span className={cn('font-semibold', band.cls)}>
      {fmtPct(pct)}
      <span className="block text-xs font-normal">{band.label}</span>
    </span>
  );
}

const machineColumns = (t: T): DataColumn<MachineRow>[] => [
  { key: 'code', header: t('hppReport.cols.code'), className: 'whitespace-nowrap font-mono text-xs', render: (m) => m.code || '—' },
  { key: 'name', header: t('oeeReport.cols.name'), rowHeader: true, render: (m) => m.name || '—' },
  { key: 'runs', header: t('oeeReport.cols.runs'), numeric: true, render: (m) => fmtNum(m.runs, 0) },
  { key: 'av', header: t('oeeReport.cols.availShort'), numeric: true, render: (m) => fmtPct(m.avgAvailability) },
  { key: 'pf', header: t('oeeReport.cols.perfShort'), numeric: true, render: (m) => fmtPct(m.avgPerformance) },
  { key: 'ql', header: t('oeeReport.cols.qualShort'), numeric: true, render: (m) => fmtPct(m.avgQuality) },
  { key: 'oee', header: 'OEE', numeric: true, render: (m) => <OeeCell pct={m.avgOee} /> },
  { key: 'run', header: t('oeeReport.cols.runHours'), numeric: true, className: 'whitespace-nowrap', render: (m) => t('oeeReport.hoursShort', { value: fmtNum(m.totalRunMin / 60, 1) }) },
  { key: 'dt', header: t('oeeReport.cols.downtime'), numeric: true, className: 'whitespace-nowrap', render: (m) => t('oeeReport.minutesShort', { value: fmtNum(m.totalDowntimeMin, 0) }) },
  { key: 'qty', header: t('oeeReport.cols.allocatedOutput'), numeric: true, render: (m) => fmtNum(m.totalAllocatedQty, 1) },
];

const shiftColumns = (t: T): DataColumn<ShiftRow>[] => [
  { key: 'shift', header: t('oeeReport.cols.shift'), rowHeader: true, render: (s) => s.shift },
  { key: 'runs', header: t('oeeReport.cols.runs'), numeric: true, render: (s) => fmtNum(s.runs, 0) },
  { key: 'av', header: t('oeeReport.cols.availShort'), numeric: true, render: (s) => fmtPct(s.avgAvailability) },
  { key: 'pf', header: t('oeeReport.cols.perfShort'), numeric: true, render: (s) => fmtPct(s.avgPerformance) },
  { key: 'ql', header: t('oeeReport.cols.qualShort'), numeric: true, render: (s) => fmtPct(s.avgQuality) },
  { key: 'oee', header: 'OEE', numeric: true, render: (s) => <OeeCell pct={s.avgOee} /> },
];

const trendColumns = (t: T): DataColumn<TrendRow>[] => [
  { key: 'date', header: t('reportsShared.date'), rowHeader: true, className: 'whitespace-nowrap', render: (r) => r.date },
  { key: 'runs', header: t('oeeReport.cols.runs'), numeric: true, render: (r) => fmtNum(r.runs, 0) },
  { key: 'oee', header: 'OEE', numeric: true, render: (r) => fmtPct(r.avgOee) },
  { key: 'av', header: t('oeeReport.availability'), numeric: true, render: (r) => fmtPct(r.avgAvailability) },
  { key: 'pf', header: t('oeeReport.performance'), numeric: true, render: (r) => fmtPct(r.avgPerformance) },
  { key: 'ql', header: t('oeeReport.quality'), numeric: true, render: (r) => fmtPct(r.avgQuality) },
];

const [OEE_STYLE, AVAIL_STYLE, PERF_STYLE, QUAL_STYLE] = SERIES_STYLES;

function trendSummary(t: T, trend: ReadonlyArray<TrendRow>): string {
  if (trend.length === 0) return t('oeeReport.trendEmpty');
  const best = trend.reduce((a, b) => (b.avgOee > a.avgOee ? b : a));
  const worst = trend.reduce((a, b) => (b.avgOee < a.avgOee ? b : a));
  return t('oeeReport.trendSummary', {
    count: trend.length,
    best: fmtPct(best.avgOee),
    bestDate: best.date,
    worst: fmtPct(worst.avgOee),
    worstDate: worst.date,
  });
}

function OeeTrendChart({ trend, summary }: { trend: TrendRow[]; summary: OeeSummary }) {
  const { t } = useTranslation('reports');
  const animate = useChartAnimation();
  const avg = (v: number) => t('oeeReport.average', { value: fmtPct(v) });
  const names = { availability: t('oeeReport.availability'), performance: t('oeeReport.performance'), quality: t('oeeReport.quality') };
  const legend: ChartLegendItem[] = [
    { name: 'OEE', style: OEE_STYLE, value: avg(summary.avgOee) },
    { name: names.availability, style: AVAIL_STYLE, value: avg(summary.avgAvailability) },
    { name: names.performance, style: PERF_STYLE, value: avg(summary.avgPerformance) },
    { name: names.quality, style: QUAL_STYLE, value: avg(summary.avgQuality) },
  ];
  return (
    <ChartFigure
      title={t('oeeReport.trendTitle')}
      summary={trendSummary(t, trend)}
      legend={legend}
      table={
        <ReportDataTable
          caption={t('oeeReport.trendCaption')}
          columns={trendColumns(t)}
          rows={trend}
          getRowKey={(r) => r.date}
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
            label={{ value: t('oeeReport.worldClassLine'), position: 'insideBottomRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
            labelFormatter={(label, payload) => t('oeeReport.tooltipLabel', { label, count: payload?.[0]?.payload?.runs ?? 0 })}
          />
          <Line type="monotone" dataKey="avgOee" name="OEE" stroke={OEE_STYLE.color} strokeWidth={OEE_STYLE.width} dot={seriesDot(OEE_STYLE)} isAnimationActive={animate} />
          <Line type="monotone" dataKey="avgAvailability" name={names.availability} stroke={AVAIL_STYLE.color} strokeWidth={AVAIL_STYLE.width} strokeDasharray={AVAIL_STYLE.dash} dot={seriesDot(AVAIL_STYLE, 3)} isAnimationActive={animate} />
          <Line type="monotone" dataKey="avgPerformance" name={names.performance} stroke={PERF_STYLE.color} strokeWidth={PERF_STYLE.width} strokeDasharray={PERF_STYLE.dash} dot={seriesDot(PERF_STYLE, 3)} isAnimationActive={animate} />
          <Line type="monotone" dataKey="avgQuality" name={names.quality} stroke={QUAL_STYLE.color} strokeWidth={QUAL_STYLE.width} strokeDasharray={QUAL_STYLE.dash} dot={seriesDot(QUAL_STYLE, 3)} isAnimationActive={animate} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

function DowntimePareto({ downtime }: { downtime: DowntimeRow[] }) {
  const { t } = useTranslation('reports');
  const total = downtime.reduce((s, d) => s + d.totalMin, 0);
  const max = downtime.length > 0 ? downtime[0].totalMin : 1;
  const rows = downtime.map((d, i) => {
    const cum = downtime.slice(0, i + 1).reduce((s, x) => s + x.totalMin, 0);
    return { ...d, cumulativePct: total > 0 ? Math.round((cum / total) * 1000) / 10 : 0 };
  });
  return (
    <ol className="space-y-3" aria-label={t('oeeReport.paretoLabel')}>
      {rows.map((d) => (
        <li key={d.category}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-xs">
            <span className="font-medium text-foreground">{d.category}</span>
            <span className="num text-muted-foreground">
              {t('oeeReport.paretoRow', { minutes: fmtNum(d.totalMin, 0), count: d.count, cumulative: d.cumulativePct })}
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

function oeeCards(t: T, s: OeeSummary): { main: SummaryItem[]; other: SummaryItem[] } {
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
      { label: t('oeeReport.availability'), value: s.avgAvailability, formatted: fmtPct(s.avgAvailability), icon: Activity, tone: 'neutral' },
      { label: t('oeeReport.performance'), value: s.avgPerformance, formatted: fmtPct(s.avgPerformance), icon: Activity, tone: 'neutral' },
      { label: t('oeeReport.quality'), value: s.avgQuality, formatted: fmtPct(s.avgQuality), icon: Activity, tone: 'neutral' },
    ],
    other: [
      { label: t('oeeReport.totalRuns'), value: s.totalRuns, formatted: fmtNum(s.totalRuns, 0), icon: Layers, tone: 'neutral', hint: t('oeeReport.runsWithOee', { count: s.runsWithOee }) },
      { label: t('oeeReport.totalDowntime'), value: s.totalDowntimeMin, formatted: fmtMinutes(s.totalDowntimeMin), icon: Clock, tone: 'neutral' },
      { label: t('oeeReport.machinesUsed'), value: s.machinesUsed, formatted: fmtNum(s.machinesUsed, 0), icon: Cog, tone: 'neutral' },
    ],
  };
}

export default function OeeReport() {
  const { t } = useTranslation('reports');
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
  const cards = summary ? oeeCards(t, summary) : null;

  return (
    <ReportPage
      title={t('oeeReport.title')}
      description={t('oeeReport.description')}
      period={periodLabel({ startDate, endDate })}
      actions={<ExportMenu disabled={isLoading || isError} />}
      filters={
        <div className="flex flex-col gap-3">
          <ReportNotice tone="info">
            <Trans t={t} i18nKey="oeeReport.notice" components={{ b: <strong /> }} />
          </ReportNotice>
          <ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange} />
        </div>
      }
      summary={
        cards ? (
          <div className="space-y-3">
            <ReportSummaryCards label={t('oeeReport.summaryOee')} items={cards.main} />
            <ReportSummaryCards label={t('dailyReport.production.summary')} items={cards.other} />
          </div>
        ) : undefined
      }
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={!summary && !isLoading} onRetry={() => refetch()}>
        {data && summary && (
          <div className="space-y-5">
            <ReportSection title={t('oeeReport.trendSection')} icon={Gauge}>
              {data.trend.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('oeeReport.trendSectionEmpty')}</p>
              ) : (
                <OeeTrendChart trend={data.trend} summary={summary} />
              )}
            </ReportSection>

            <ReportSection title={t('oeeReport.perMachine')} icon={Cog} flush>
              <ReportDataTable
                variant="bare"
                caption={t('oeeReport.perMachineCaption')}
                columns={machineColumns(t)}
                rows={data.perMachine}
                getRowKey={(m) => m.machineId}
                emptyText={t('oeeReport.perMachineEmpty')}
                maxHeightClass="max-h-[60vh]"
              />
            </ReportSection>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <ReportSection title={t('oeeReport.perShift')} icon={Layers} flush>
                <ReportDataTable
                  variant="bare"
                  caption={t('oeeReport.perShiftCaption')}
                  columns={shiftColumns(t)}
                  rows={data.perShift}
                  getRowKey={(s) => s.shift}
                  emptyText={t('oeeReport.perShiftEmpty')}
                />
              </ReportSection>
              <ReportSection title={t('oeeReport.downtimeSection')} icon={Clock}>
                {data.downtimeByCategory.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t('oeeReport.downtimeEmpty')}</p>
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
