import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, Calculator, ChevronDown, ChevronRight, Factory, Layers, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
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
  const { t } = useTranslation('reports');
  if (flagZero && kg === 0) {
    return (
      <span className="inline-flex items-center justify-end gap-1 font-medium text-warning-text">
        <AlertTriangle className="size-3.5" aria-hidden />
        0<span className="sr-only"> {t('productionCostSummary.noByproductSr')}</span>
      </span>
    );
  }
  return <>{fmt0(kg)}</>;
}

const metricColumns = (t: TFunction<'reports'>): DataColumn<Row>[] => [
  { key: 'runs', header: t('oeeReport.cols.runs'), numeric: true, render: (g) => g.runCount },
  { key: 'inKg', header: t('productionCostSummary.cols.inputKg'), numeric: true, render: (g) => fmt0(g.inputKg) },
  { key: 'inRp', header: t('productionCostSummary.cols.inputRp'), numeric: true, render: (g) => fmt0(g.inputRp) },
  { key: 'inPer', header: t('productionCostSummary.cols.inputPerKg'), numeric: true, render: (g) => fmt2(g.inputPerKg) },
  { key: 'outKg', header: t('productionCostSummary.cols.outputKg'), numeric: true, render: (g) => fmt0(g.mainKg) },
  { key: 'yield', header: t('productionCostSummary.cols.yield'), numeric: true, render: (g) => `${fmt2(g.yieldPct)}%` },
  { key: 'raw', header: t('productionCostSummary.cols.rawPerKg'), numeric: true, className: cn(RAW_CELL, 'font-bold'), render: (g) => fmt2(g.rawMaterialPerKg) },
  { key: 'gl', header: t('productionCostSummary.cols.glPerKg'), numeric: true, render: (g) => fmt2(g.glPerKg) },
  { key: 'diff', header: t('productionCostSummary.cols.diffPerKg'), numeric: true, render: (g) => <DiffCell gl={g.glPerKg} raw={g.rawMaterialPerKg} /> },
  { key: 'by', header: t('productionCostSummary.cols.byproductKg'), numeric: true, render: (g) => <ByproductCell kg={g.byproductKg} /> },
];

export default function ProductionCostSummary() {
  const { t } = useTranslation('reports');
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
    const x = (k: 'type' | 'warehouse' | 'runs' | 'inputKg' | 'inputRp' | 'inputPerKg' | 'outputKg' | 'yield' | 'rawPerKg' | 'glPerKg' | 'diffPerKg' | 'byproductKg' | 'byproductRp' | 'conversionRp') =>
      t(`productionCostSummary.excel.${k}`);
    const toRow = (type: string, warehouse: string, g: Row) => ({
      [x('type')]: type,
      [x('warehouse')]: warehouse,
      [x('runs')]: g.runCount,
      [x('inputKg')]: Math.round(g.inputKg),
      [x('inputRp')]: Math.round(g.inputRp),
      [x('inputPerKg')]: +g.inputPerKg.toFixed(2),
      [x('outputKg')]: Math.round(g.mainKg),
      [x('yield')]: +g.yieldPct.toFixed(2),
      [x('rawPerKg')]: +g.rawMaterialPerKg.toFixed(2),
      [x('glPerKg')]: +g.glPerKg.toFixed(2),
      [x('diffPerKg')]: +(g.glPerKg - g.rawMaterialPerKg).toFixed(2),
      [x('byproductKg')]: Math.round(g.byproductKg),
      [x('byproductRp')]: Math.round(g.byproductRp),
      [x('conversionRp')]: Math.round(g.conversionCostRp),
    });
    const rows = [
      ...data.summary.map((g) => toRow(g.outputName, g.warehouseName, g)),
      toRow(t('reportsShared.totalUpper'), '', data.total),
    ];
    await exportToExcel(rows, `modal-produksi_${startDate}_${endDate}`);
  };

  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const columns: DataColumn<Row>[] = [
    {
      key: 'output',
      header: t('productionCostSummary.cols.output'),
      rowHeader: true,
      render: (g) => {
        const key = groupKey(g);
        const isOpen = !!open[key];
        return (
          <button
            type="button"
            onClick={() => toggle(key)}
            aria-expanded={isOpen}
            aria-label={t('productionCostSummary.runDetailLabel', { output: g.outputName, warehouse: g.warehouseName })}
            className={cn('-ml-1 inline-flex min-h-8 items-center gap-1 rounded-sm px-1 text-left max-sm:min-h-11', focusRing)}
          >
            {isOpen ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
            {g.outputName}
          </button>
        );
      },
    },
    { key: 'wh', header: t('poOutstanding.excel.warehouse'), className: 'whitespace-nowrap text-xs text-muted-foreground', render: (g) => g.warehouseName },
    ...metricColumns(t),
  ];

  const renderRuns = (g: Row) => {
    const key = groupKey(g);
    if (!open[key]) return null;
    return (runsByGroup.get(key) ?? []).map((r) => (
      <tr key={r.runId} className="border-b border-border bg-muted/40 text-xs">
        <th scope="row" className="py-2 pl-8 pr-4 text-left font-mono font-normal max-sm:pr-3">{r.runNumber}</th>
        <td className="px-4 py-2 text-muted-foreground max-sm:px-3">
          {formatDate(r.date, 'short')}
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

  const tot = data?.total;
  const total = tot && (
    <tr className={TOTAL_ROW_CLASS}>
      <th scope="row" className="px-4 py-2.5 text-left max-sm:px-3">{t('reportsShared.totalUpper')}</th>
      <td aria-hidden="true" />
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{tot.runCount}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt0(tot.inputKg)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt0(tot.inputRp)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt2(tot.inputPerKg)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt0(tot.mainKg)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt2(tot.yieldPct)}%</td>
      <td className={cn('num px-4 py-2.5 text-right max-sm:px-3', RAW_CELL)}>{fmt2(tot.rawMaterialPerKg)}</td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt2(tot.glPerKg)}</td>
      <td className="px-4 py-2.5 text-right max-sm:px-3"><DiffCell gl={tot.glPerKg} raw={tot.rawMaterialPerKg} /></td>
      <td className="num px-4 py-2.5 text-right max-sm:px-3">{fmt0(tot.byproductKg)}</td>
    </tr>
  );

  const hasRuns = !!tot && tot.runCount > 0;

  return (
    <ReportPage
      title={t('productionCostSummary.title')}
      description={t('productionCostSummary.description')}
      period={periodLabel({ startDate, endDate })}
      actions={<ExportMenu onExcel={handleExport} disabled={isLoading || isError || !data || data.summary.length === 0} />}
      filters={
        <div className="flex flex-col gap-3">
          <ReportNotice tone="info">
            <p className="font-medium">{t('productionCostSummary.notice.title')}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              <li><Trans t={t} i18nKey="productionCostSummary.notice.raw" components={{ b: <strong /> }} /></li>
              <li><Trans t={t} i18nKey="productionCostSummary.notice.gl" components={{ b: <strong /> }} /></li>
              <li><Trans t={t} i18nKey="productionCostSummary.notice.diff" components={{ b: <strong /> }} /></li>
            </ul>
          </ReportNotice>
          <ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange}>
            <ComboboxFilter
              label={t('productionCostSummary.warehouseFilter')}
              value={warehouseId}
              onChange={setWarehouseId}
              options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
              allLabel={t('productionCostSummary.allWarehouses')}
              searchPlaceholder={t('productionCostSummary.searchWarehouse')}
              className="w-full sm:w-56"
            />
          </ReportFilters>
        </div>
      }
      summary={
        hasRuns && tot ? (
          <ReportSummaryCards
            items={[
              {
                label: t('productionCostSummary.summary.production'),
                value: tot.runCount,
                formatted: t('productionCostSummary.summary.runs', { count: tot.runCount }),
                icon: Factory,
                hint: t('productionCostSummary.summary.productionHint', { input: fmt0(tot.inputKg), output: fmt0(tot.mainKg) }),
              },
              {
                label: t('productionCostSummary.cols.inputRp'),
                value: tot.inputRp,
                icon: Wallet,
                tone: 'neutral',
                hint: t('productionCostSummary.summary.perKgInput', { value: formatRupiah(tot.inputPerKg, { decimals: 2 }) }),
              },
              {
                label: t('productionCostSummary.summary.raw'),
                value: tot.rawMaterialPerKg,
                formatted: t('productionCostSummary.summary.perKg', { value: formatRupiah(tot.rawMaterialPerKg, { decimals: 2 }) }),
                icon: Layers,
                tone: 'neutral',
                hint: t('productionCostSummary.summary.yieldHint', { value: fmt2(tot.yieldPct) }),
              },
              {
                label: t('productionCostSummary.summary.gl'),
                value: tot.glPerKg,
                formatted: t('productionCostSummary.summary.perKg', { value: formatRupiah(tot.glPerKg, { decimals: 2 }) }),
                icon: Calculator,
                tone: 'neutral',
                hint: <Trans t={t} i18nKey="productionCostSummary.summary.glHint" components={{ diff: <DiffCell gl={tot.glPerKg} raw={tot.rawMaterialPerKg} /> }} />,
              },
            ]}
          />
        ) : undefined
      }
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={!!data && data.summary.length === 0} onRetry={() => refetch()}>
        <ReportDataTable
          caption={t('productionCostSummary.caption', { period: periodLabel({ startDate, endDate }) })}
          columns={columns}
          rows={data?.summary ?? []}
          getRowKey={groupKey}
          afterRow={renderRuns}
          footer={total}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {t('productionCostSummary.footnote')}
        </p>
      </ReportState>
    </ReportPage>
  );
}
