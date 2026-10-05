/**
 * REPORT KIT — building blocks for financial/operational report pages.
 *
 * Anatomy of a report page (see pages/reports/TrialBalance.tsx, ProfitLoss.tsx,
 * BalanceSheet.tsx for complete examples):
 *
 *   const { startDate, endDate, setRange, list } = useReportRange();   // URL-synced (?startDate&endDate)
 *   // as-of reports: const { date, setDate } = useReportAsOf();        // URL-synced (?date)
 *   const { data, isLoading, isError, refetch } = useQuery({ ...same queryKey/queryFn as before });
 *
 *   <ReportPage                                  // H1 == registry label, description, "Dicetak pada" meta
 *     title="Laba Rugi" description="..."
 *     period={periodLabel({ startDate, endDate })}
 *     actions={<ExportMenu onExcel={...} pdf={{ fileName, render: () => <MyPDF .../> }} />}
 *     filters={<ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange}>{extra}</ReportFilters>}
 *     summary={<ReportSummaryCards items={[{ label, value, icon }]} loading={isLoading} />}
 *   >
 *     <ReportState isLoading isError isEmpty onRetry={refetch}>
 *       <ReportTable caption="..." columns={[{ key: 'amount', label: 'Jumlah (Rp)' }]}
 *                    rows={[...]} footer={[...]} />      // rows: ReportRow[]; use flattenAccountTree() for COA trees
 *     </ReportState>
 *   </ReportPage>
 *
 * Rules: amounts are display-only (never change numbers/queries here); negatives
 * show as (Rp 1.000); use <ReportNotice> for warnings (icon + text); keep the
 * export payloads in the page (they are business data, not presentation).
 */
export { ReportPage, type ReportPageProps } from './ReportPage';
export { ReportFilters, type ReportFiltersProps } from './ReportFilters';
export { ReportSummaryCards, type ReportSummaryCardsProps, type SummaryItem } from './ReportSummaryCards';
export { ReportTable, type ReportTableProps, type ReportColumn } from './ReportTable';
export { ReportState, type ReportStateProps } from './ReportState';
export { ReportNotice, type ReportNoticeProps } from './ReportNotice';
export { ExportMenu, type ExportMenuProps, type ExportPdf } from './ExportMenu';
export { useReportRange, useReportAsOf, type ReportRangeState, type ReportAsOfState, type ReportRangeOptions } from './use-report-period';
export {
  RANGE_PRESETS,
  AS_OF_PRESETS,
  rangeForPreset,
  asOfForPreset,
  detectRangePreset,
  detectAsOfPreset,
  normalizeRange,
  normalizeAsOf,
  isRangeValid,
  isIsoDate,
  toIso,
  periodLabel,
  type DateRange,
  type RangePreset,
  type AsOfPreset,
} from './period';
export { flattenAccountTree, visibleRows, formatAmount, type ReportRow, type ReportRowKind, type AccountNode } from './rows';
export { ReportDataTable, TOTAL_ROW_CLASS, type ReportDataTableProps, type DataColumn } from './ReportDataTable';
export { ReportSection, ReportFilterSection, ReportMetricGrid, type ReportSectionProps, type MetricItem } from './ReportSection';
export { ChartFigure, SeriesSwatch, type ChartFigureProps, type ChartLegendItem } from './ReportChart';
export {
  seriesDot,
  SERIES_STYLES,
  CHART_AXIS_TICK,
  CHART_GRID_STROKE,
  CHART_TOOLTIP_STYLE,
  type SeriesStyle,
  type SeriesShape,
} from './chart-series';
