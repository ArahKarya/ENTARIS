import { lazy, Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import { Settings2, LayoutDashboard, DollarSign, TrendingUp, Package, Factory, Building2 } from 'lucide-react';
import { PageHeader } from '../components/shared';
import { Button } from '../components/ui/button';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { can } from '../lib/permissions';
import { useCompanySettings } from '../contexts/CompanySettingsContext';

// Widgets (chart widgets are lazy: recharts stays out of the landing-page bundle)
import KPICards from '../components/widgets/KPICards';
import AttentionList from '../components/widgets/AttentionList';
import RecentActivities from '../components/widgets/RecentActivities';
import TopCustomers from '../components/widgets/TopCustomers';
import OverdueInvoices from '../components/widgets/OverdueInvoices';
import PendingDOWidget from '../components/widgets/PendingDOWidget';
import StockAlert from '../components/widgets/StockAlert';
import NegativeStockWidget from '../components/widgets/NegativeStockWidget';
import WarehouseKPICards from '../components/widgets/WarehouseKPICards';
import CategoryDistribution from '../components/widgets/CategoryDistribution';
import TopItemsByStock from '../components/widgets/TopItemsByStock';
import RecentMovements from '../components/widgets/RecentMovements';
import ProductionStatsWidget from '../components/widgets/ProductionStatsWidget';
import FixedAssetsKPI from '../components/widgets/FixedAssetsKPI';
import DepreciationDue from '../components/widgets/DepreciationDue';
import TopAssetsByValue from '../components/widgets/TopAssetsByValue';
import ProfitabilityPerSku from '../components/widgets/ProfitabilityPerSku';
import FinancialRatios from '../components/widgets/FinancialRatios';
import CashFlowChart from '../components/widgets/CashFlowChart';
import AgingSummary from '../components/widgets/AgingSummary';
import CashPositionWidget from '../components/widgets/CashPositionWidget';
import TopVendors from '../components/widgets/TopVendors';
import CogsBackfillWidget from '../components/widgets/CogsBackfillWidget';
import { WidgetSkeleton } from '../components/dashboard-kit';
import DashboardSettings, { DEFAULT_WIDGETS, type WidgetConfig } from '../components/DashboardSettings';
import DashboardSectionNav, { type SectionDef } from '../components/DashboardSectionNav';
import DashboardPeriodFilter, { type PeriodRange, computePresetRange } from '../components/DashboardPeriodFilter';
import { SetupChecklistCard } from '../components/onboarding/SetupChecklistCard';

const RevenueChart = lazy(() => import('../components/widgets/RevenueChart'));
const MonthlyProfitChart = lazy(() => import('../components/widgets/MonthlyProfitChart'));
const ExpenseBreakdown = lazy(() => import('../components/widgets/ExpenseBreakdown'));
const MovementTrendChart = lazy(() => import('../components/widgets/MovementTrendChart'));
const YieldTrendChart = lazy(() => import('../components/widgets/YieldTrendChart'));
const FixedAssetsByCategory = lazy(() => import('../components/widgets/FixedAssetsByCategory'));
const ProductionDeepDive = lazy(() => import('../components/widgets/ProductionDeepDive'));

/** Suspense wrapper with a fixed-height skeleton so lazy chunks never shift the layout. */
function Lazy({ height = 300, children }: { height?: number; children: React.ReactNode }) {
  return <Suspense fallback={<WidgetSkeleton height={height} />}>{children}</Suspense>;
}
// Widget IDs only visible to finance roles (not StaffProduksi)
const FINANCE_WIDGET_IDS = new Set([
  'revenue-chart', 'recent-activities', 'top-customers',
  'overdue-invoices', 'expense-breakdown',
  'financial-ratios', 'monthly-profit', 'cash-flow-summary', 'aging-summary',
  'cash-position', 'top-vendors',
  // Aset & profitability sensitive — finance only
  'fixed-assets-kpi', 'fixed-assets-by-category', 'depreciation-due', 'top-assets',
  'profitability-per-sku',
]);

const KEUANGAN_WIDGETS = ['revenue-chart', 'monthly-profit', 'cash-flow-summary', 'financial-ratios', 'expense-breakdown', 'aging-summary', 'overdue-invoices', 'top-vendors'];
const SALES_WIDGETS = ['top-customers', 'recent-activities', 'profitability-per-sku'];
const STOK_WIDGETS = ['warehouse-kpi', 'stock-alert', 'movement-trend', 'category-distribution', 'top-items', 'recent-movements', 'cogs-backfill'];
const PRODUKSI_WIDGETS = ['production-stats', 'yield-trend', 'production-deep-dive'];
const ASET_WIDGETS = ['fixed-assets-kpi', 'fixed-assets-by-category', 'depreciation-due', 'top-assets'];

const STORAGE_KEY = 'dashboard-widgets';

function loadWidgetPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate legacy widget id 'rendemen-trend' → 'yield-trend' so user's saved toggle carries over
      if (parsed['rendemen-trend'] !== undefined && parsed['yield-trend'] === undefined) {
        parsed['yield-trend'] = parsed['rendemen-trend'];
        delete parsed['rendemen-trend'];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return {};
}

function saveWidgetPrefs(prefs: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}

function SectionHeader({ icon: Icon, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="ml-2 h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export const Dashboard = () => {
  const company = useCompanySettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [widgetPrefs, setWidgetPrefs] = useState<Record<string, boolean>>(loadWidgetPrefs);

  const userRole = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null')?.role; }
    catch { return null; }
  }, []);
  const isStaffProduksi = userRole === 'StaffProduksi';
  // Akses widget keuangan berbasis izin modul 'reports' (RBAC), bukan hardcode role.
  // Siapa pun tanpa izin lihat Laporan (mis. Staff HRGA) tak melihat widget keuangan.
  const canFinance = useMemo(() => can('reports', 'view'), []);

  const canApprovals = useMemo(() => can('approvals', 'view'), []);

  const availableWidgets = useMemo(
    () => canFinance
      ? DEFAULT_WIDGETS
      : DEFAULT_WIDGETS.filter((w) => !FINANCE_WIDGET_IDS.has(w.id)),
    [canFinance]
  );

  const widgets: WidgetConfig[] = useMemo(
    () =>
      availableWidgets.map((w) => ({
        ...w,
        enabled: widgetPrefs[w.id] !== undefined ? widgetPrefs[w.id] : w.enabled,
      })),
    [availableWidgets, widgetPrefs]
  );

  const isEnabled = useCallback(
    (id: string) => {
      const w = widgets.find((w) => w.id === id);
      return w?.enabled ?? true;
    },
    [widgets]
  );

  const anyEnabled = useCallback(
    (ids: string[]) => ids.some((id) => isEnabled(id)),
    [isEnabled]
  );

  const handleToggle = useCallback(
    (id: string) => {
      setWidgetPrefs((prev) => {
        const next = { ...prev, [id]: !(prev[id] !== undefined ? prev[id] : true) };
        saveWidgetPrefs(next);
        return next;
      });
    },
    []
  );

  // Period filter state (persisted to localStorage).
  // FIX(dashboard-stale-period, 2026-08-13): preset non-custom (Bulan Ini, Bulan
  // Lalu, dst) dulu menyimpan startDate/endDate absolut ke localStorage. Saat
  // dashboard dibuka lagi di bulan/hari berikutnya, tanggal lama itu dipakai
  // apa adanya tanpa dihitung ulang — label UI bilang "Bulan Ini" tapi query
  // API jalan dengan rentang tanggal basi, sehingga data terlihat "tidak
  // update". Sekarang preset non-custom SELALU dihitung ulang dari hari ini
  // saat load; hanya preset 'custom' yang boleh pakai tanggal literal tersimpan.
  const [period, setPeriod] = useState<PeriodRange>(() => {
    try {
      const raw = localStorage.getItem('dashboard-period');
      if (raw) {
        const saved = JSON.parse(raw) as PeriodRange;
        if (saved.preset === 'custom') return saved;
        const fresh = computePresetRange(saved.preset);
        return { preset: saved.preset, ...fresh };
      }
    } catch { /* ignore */ }
    const def = computePresetRange('thisMonth');
    return { preset: 'thisMonth', ...def };
  });
  useEffect(() => {
    try { localStorage.setItem('dashboard-period', JSON.stringify(period)); } catch { /* ignore */ }
  }, [period]);

  const periodParams = { startDate: period.startDate, endDate: period.endDate };

  // Data queries (period-aware). Metrics live in <KPICards> (same query keys).
  const { data: chartData, isLoading: isChartsLoading, isError: isChartsError, refetch: refetchCharts } = useQuery({
    queryKey: ['dashboard-charts', period.startDate, period.endDate],
    queryFn: async () => {
      const r = await api.get('/dashboard/charts', { params: periodParams });
      return r.data;
    },
    enabled: canFinance,
  });

  const { data: recentActivities, isLoading: isActivitiesLoading, isError: isActivitiesError, refetch: refetchActivities } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: async () => {
      const r = await api.get('/payments');
      const list = r.data.data ?? r.data;
      return Array.isArray(list) ? list.slice(0, 6) : [];
    },
    enabled: canFinance,
  });

  const showKeuangan = canFinance && anyEnabled(KEUANGAN_WIDGETS);
  const showSales = canFinance && anyEnabled(SALES_WIDGETS);
  const showStok = anyEnabled(STOK_WIDGETS);
  const showProduksi = anyEnabled(PRODUKSI_WIDGETS);
  const showAset = canFinance && anyEnabled(ASET_WIDGETS);

  const sections: SectionDef[] = useMemo(() => {
    const list: SectionDef[] = [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }];
    if (showKeuangan) list.push({ id: 'keuangan', label: 'Keuangan', icon: DollarSign });
    if (showSales) list.push({ id: 'sales', label: 'Sales', icon: TrendingUp });
    if (showStok) list.push({ id: 'stok', label: 'Stok', icon: Package });
    if (showProduksi) list.push({ id: 'produksi', label: 'Produksi', icon: Factory });
    if (showAset) list.push({ id: 'aset', label: 'Aset', icon: Building2 });
    return list;
  }, [showKeuangan, showSales, showStok, showProduksi, showAset]);

  const showAttention = isEnabled('attention-list');
  const showRevenue = canFinance && isEnabled('revenue-chart');

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Dasbor"
        icon={LayoutDashboard}
        description={
          isStaffProduksi
            ? `Ringkasan stok, gudang & produksi ${company?.companyName || 'perusahaan Anda'}`
            : `Ringkasan kinerja ${company?.companyName || 'perusahaan Anda'}`
        }
        className="border-b border-border"
        actions={
          <>
            <DashboardPeriodFilter value={period} onChange={setPeriod} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="Konfigurasi dasbor"
              title="Konfigurasi dasbor"
              className="size-11 sm:size-9"
            >
              <Settings2 size={16} aria-hidden />
            </Button>
          </>
        }
      />

      <SetupChecklistCard />

      {/* Sticky Section Nav */}
      <DashboardSectionNav sections={sections} />

      {/* ─────────── SECTION: OVERVIEW ─────────── */}
      <section id="overview" aria-label="Overview" className="space-y-4 scroll-mt-20">
        <SectionHeader icon={LayoutDashboard} title="Overview" subtitle="Ringkasan performa utama" />
        <KPICards period={period} canFinance={canFinance} />
        {(showRevenue || showAttention) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {showRevenue && (
              <div className={showAttention ? 'min-w-0 lg:col-span-2' : 'min-w-0 lg:col-span-3'}>
                <Lazy height={330}>
                  <RevenueChart data={chartData} loading={isChartsLoading} isError={isChartsError} onRetry={() => void refetchCharts()} />
                </Lazy>
              </div>
            )}
            {showAttention && (
              <div className={showRevenue ? 'min-w-0' : 'min-w-0 lg:col-span-3'}>
                <AttentionList canFinance={canFinance} canApprovals={canApprovals} />
              </div>
            )}
          </div>
        )}
        {canFinance && isEnabled('cash-position') && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CashPositionWidget />
          </div>
        )}
      </section>

      {/* ─────────── SECTION: KEUANGAN ─────────── */}
      {showKeuangan && (
        <section id="keuangan" aria-label="Keuangan" className="space-y-4 scroll-mt-20">
          <SectionHeader icon={DollarSign} title="Keuangan" subtitle="Laba, arus kas & rasio" />

          {(isEnabled('monthly-profit') || isEnabled('expense-breakdown')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {isEnabled('monthly-profit') && (
                <Lazy height={330}>
                  <MonthlyProfitChart startDate={period.startDate} endDate={period.endDate} />
                </Lazy>
              )}
              {isEnabled('expense-breakdown') && (
                <Lazy height={330}>
                  <ExpenseBreakdown startDate={period.startDate} endDate={period.endDate} />
                </Lazy>
              )}
            </div>
          )}

          {(isEnabled('cash-flow-summary') || isEnabled('financial-ratios') || isEnabled('aging-summary')) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {isEnabled('cash-flow-summary') && <CashFlowChart startDate={period.startDate} endDate={period.endDate} />}
              {isEnabled('financial-ratios') && <FinancialRatios />}
              {isEnabled('aging-summary') && <AgingSummary />}
            </div>
          )}

          {(isEnabled('overdue-invoices') || isEnabled('top-vendors')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {isEnabled('overdue-invoices') && <OverdueInvoices />}
              {isEnabled('top-vendors') && <TopVendors />}
            </div>
          )}
        </section>
      )}

      {/* ─────────── SECTION: SALES ─────────── */}
      {showSales && (
        <section id="sales" aria-label="Sales" className="space-y-4 scroll-mt-20">
          <SectionHeader icon={TrendingUp} title="Sales" subtitle="Pelanggan & aktivitas pembayaran" />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {isEnabled('top-customers') && <TopCustomers />}
            {isEnabled('recent-activities') && (
              <RecentActivities
                data={recentActivities || null}
                isLoading={isActivitiesLoading}
                isError={isActivitiesError}
                onRetry={() => void refetchActivities()}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PendingDOWidget />
          </div>

          {isEnabled('profitability-per-sku') && (
            <ProfitabilityPerSku startDate={period.startDate} endDate={period.endDate} />
          )}
        </section>
      )}

      {/* ─────────── SECTION: STOK & GUDANG ─────────── */}
      {showStok && (
        <section id="stok" aria-label="Stok & Gudang" className="space-y-4 scroll-mt-20">
          <SectionHeader icon={Package} title="Stok & Gudang" subtitle="Inventori, pergerakan & peringatan stok" />

          {isEnabled('warehouse-kpi') && <WarehouseKPICards />}

          {(isEnabled('movement-trend') || isEnabled('category-distribution')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {isEnabled('movement-trend') && (
                <div className="min-w-0 lg:col-span-2">
                  <Lazy height={330}>
                    <MovementTrendChart />
                  </Lazy>
                </div>
              )}
              {isEnabled('category-distribution') && <CategoryDistribution />}
            </div>
          )}

          {(isEnabled('top-items') || isEnabled('recent-movements')) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {isEnabled('top-items') && <TopItemsByStock />}
              {isEnabled('recent-movements') && <RecentMovements />}
            </div>
          )}

          {isEnabled('stock-alert') && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <StockAlert />
              <NegativeStockWidget />
            </div>
          )}

          {isEnabled('cogs-backfill') && <CogsBackfillWidget />}
        </section>
      )}

      {/* ─────────── SECTION: PRODUKSI ─────────── */}
      {showProduksi && (
        <section id="produksi" aria-label="Produksi" className="space-y-4 scroll-mt-20">
          <SectionHeader icon={Factory} title="Produksi" subtitle="Statistik produksi & yield" />

          {(isEnabled('production-stats') || isEnabled('yield-trend')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {isEnabled('production-stats') && <ProductionStatsWidget />}
              {isEnabled('yield-trend') && (
                <div className="min-w-0 lg:col-span-2">
                  <Lazy height={330}>
                    <YieldTrendChart />
                  </Lazy>
                </div>
              )}
            </div>
          )}

          {isEnabled('production-deep-dive') && (
            <Lazy height={460}>
              <ProductionDeepDive startDate={period.startDate} endDate={period.endDate} />
            </Lazy>
          )}
        </section>
      )}

      {/* ─────────── SECTION: ASET TETAP ─────────── */}
      {showAset && (
        <section id="aset" aria-label="Aset Tetap" className="space-y-4 scroll-mt-20">
          <SectionHeader icon={Building2} title="Aset Tetap" subtitle="Nilai aset, distribusi, dan jadwal penyusutan" />

          {isEnabled('fixed-assets-kpi') && <FixedAssetsKPI />}

          {(isEnabled('fixed-assets-by-category') || isEnabled('depreciation-due')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {isEnabled('fixed-assets-by-category') && (
                <Lazy height={330}>
                  <FixedAssetsByCategory />
                </Lazy>
              )}
              {isEnabled('depreciation-due') && <DepreciationDue />}
            </div>
          )}

          {isEnabled('top-assets') && <TopAssetsByValue />}
        </section>
      )}

      {/* Dashboard Settings Modal */}
      <DashboardSettings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        widgets={widgets}
        onToggle={handleToggle}
      />
    </div>
  );
};
