/**
 * Dashboard kit: shells for dashboard widgets.
 *  <WidgetCard title href isLoading isError onRetry isEmpty>…</WidgetCard>   loading/error/empty handled
 *  <ChartFrame summary legend table height>{recharts chart (accessibilityLayer off)}</ChartFrame>
 *  chart-theme: CHART_COLORS / AXIS_TICK / GRID_STROKE / TOOLTIP_STYLE tokens.
 * Heavy chart widgets are lazy-imported by pages/Dashboard.tsx with <WidgetSkeleton height>.
 */
export { WidgetCard, WidgetSkeleton, type WidgetCardProps } from './WidgetCard';
export { ChartFrame, ChartTable, type ChartFrameProps, type LegendItem } from './ChartFrame';
export { CHART_COLORS, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, compactIdrTick } from './chart-theme';
export { MiniTable, type MiniTableProps, type MiniColumn } from './MiniTable';
export { DonutBreakdown, type DonutBreakdownProps, type DonutDatum } from './DonutBreakdown';
export { ScrollRegion } from './ScrollRegion';
