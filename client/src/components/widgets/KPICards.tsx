import { useQuery } from '@tanstack/react-query';
import { CreditCard, HandCoins, Package, PackageX, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { StatCard, type StatDelta } from '../shared/stat-card';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { deltaPct, previousPeriod } from '../dashboard-kit/period';
import type { PeriodRange } from '../DashboardPeriodFilter';

interface Metrics {
  cashBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
  vendorDeposit: number;
  inventoryValue: number;
  netProfit: number;
}

interface ChartPoint {
  pendapatan: number;
  beban: number;
}

interface StockAlertRow {
  status: string;
}

interface KPICardsProps {
  period: PeriodRange;
  /** Finance KPIs need the 'reports' module; others only see the stock tile. */
  canFinance: boolean;
}

const sumRevenue = (rows?: ChartPoint[]) => (rows ?? []).reduce((s, r) => s + r.pendapatan, 0);

function toDelta(cur: number | undefined, prev: number | undefined, enabled: boolean): StatDelta | undefined {
  if (!enabled || cur === undefined || prev === undefined) return undefined;
  const d = deltaPct(cur, prev);
  return d ? { value: d.text, direction: d.direction, label: 'vs periode sebelumnya' } : undefined;
}

/**
 * Executive KPI strip. Same endpoints/params as before (metrics, charts, stock-alerts);
 * the previous-period delta re-uses them with the comparison window (no new endpoints).
 */
export default function KPICards({ period, canFinance }: KPICardsProps) {
  const prev = previousPeriod(period);
  const params = { startDate: period.startDate, endDate: period.endDate };
  const prevParams = prev ?? params;

  const metrics = useQuery<Metrics>({
    queryKey: ['dashboard-metrics', period.startDate, period.endDate],
    queryFn: async () => (await api.get('/dashboard/metrics', { params })).data,
    enabled: canFinance,
  });
  const charts = useQuery<ChartPoint[]>({
    queryKey: ['dashboard-charts', period.startDate, period.endDate],
    queryFn: async () => (await api.get('/dashboard/charts', { params })).data,
    enabled: canFinance,
  });
  const prevMetrics = useQuery<Metrics>({
    queryKey: ['dashboard-metrics', prevParams.startDate, prevParams.endDate],
    queryFn: async () => (await api.get('/dashboard/metrics', { params: prevParams })).data,
    enabled: canFinance && !!prev,
  });
  const prevCharts = useQuery<ChartPoint[]>({
    queryKey: ['dashboard-charts', prevParams.startDate, prevParams.endDate],
    queryFn: async () => (await api.get('/dashboard/charts', { params: prevParams })).data,
    enabled: canFinance && !!prev,
  });
  const stock = useQuery<StockAlertRow[]>({
    queryKey: ['dashboard-stock-alerts'],
    queryFn: async () => (await api.get('/dashboard/stock-alerts')).data,
  });

  if (canFinance && (metrics.isError || charts.isError)) {
    return (
      <WidgetCard
        title="Ringkasan Kinerja"
        isError
        minHeight={96}
        onRetry={() => {
          void metrics.refetch();
          void charts.refetch();
        }}
      />
    );
  }

  const m = metrics.data;
  const revenue = charts.data ? sumRevenue(charts.data) : undefined;
  const prevRevenue = prevCharts.data ? sumRevenue(prevCharts.data) : undefined;
  const money = (v?: number) => ({ value: formatRupiah(v, { compact: true, negative: 'parens' }), valueTitle: formatRupiah(v, { negative: 'parens' }) });
  const loadingFin = metrics.isLoading || charts.isLoading;
  const critical = stock.data?.length ?? 0;
  const empty = stock.data?.filter((s) => s.status === 'Habis').length ?? 0;

  const stockTile = (
    <StatCard
      key="stock"
      label="Stok Kritis"
      value={stock.isError ? '-' : critical >= 20 ? '20+' : String(critical)}
      icon={PackageX}
      loading={stock.isLoading}
      hint={stock.isError ? 'gagal dimuat' : critical === 0 ? 'semua stok aman' : `${empty} habis`}
      href="/inventory"
    />
  );

  if (!canFinance) {
    return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{stockTile}</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard
        label="Omzet"
        {...money(revenue)}
        icon={TrendingUp}
        loading={loadingFin}
        hint="pendapatan periode"
        delta={toDelta(revenue, prevRevenue, !!prev)}
        href="/reports/profit-loss"
      />
      <StatCard
        label="Laba Bersih"
        {...money(m?.netProfit)}
        icon={CreditCard}
        loading={loadingFin}
        hint="pada periode terpilih"
        delta={toDelta(m?.netProfit, prevMetrics.data?.netProfit, !!prev)}
        href="/reports/profit-loss"
      />
      <StatCard label="Kas & Bank" {...money(m?.cashBalance)} icon={Wallet} loading={loadingFin} hint="saldo saat ini" href="/payments" />
      <StatCard label="Piutang Usaha" {...money(m?.accountsReceivable)} icon={Receipt} loading={loadingFin} hint="saldo saat ini" href="/reports/aging-ar" />
      <StatCard label="Hutang Usaha" {...money(m?.accountsPayable)} icon={TrendingDown} loading={loadingFin} hint="saldo saat ini" href="/reports/aging-ap" />
      {stockTile}
      <StatCard label="Nilai Persediaan" {...money(m?.inventoryValue)} icon={Package} loading={loadingFin} hint="saldo saat ini" href="/inventory" />
      <StatCard label="Deposit Supplier" {...money(m?.vendorDeposit)} icon={HandCoins} loading={loadingFin} hint="saldo saat ini" href="/vendor-deposits" />
    </div>
  );
}

