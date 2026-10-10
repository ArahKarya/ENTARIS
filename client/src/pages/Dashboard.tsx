import { Children, lazy, Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, LayoutDashboard, TrendingUp, Package, Factory, Building2, Landmark } from 'lucide-react';
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
import MaintenanceUpcoming from '../components/widgets/MaintenanceUpcoming';
import UpcomingDueInvoices from '../components/widgets/UpcomingDueInvoices';
import { canViewMaintenance } from '../components/widgets/maintenanceData';
import CogsBackfillWidget from '../components/widgets/CogsBackfillWidget';
import { WidgetSkeleton } from '../components/dashboard-kit';
import DashboardSettings from '../components/DashboardSettings';
import { defaultWidgets, type WidgetConfig } from '../components/dashboardWidgets';
import DashboardSectionNav, { type SectionDef } from '../components/DashboardSectionNav';
import { tabId } from '../components/dashboardTabId';
import DashboardPeriodFilter, { type PeriodRange } from '../components/DashboardPeriodFilter';
import { computePresetRange } from '../components/dashboardPeriod';
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
  'cash-position', 'top-vendors', 'upcoming-due',
  // Aset & profitability sensitive — finance only
  'fixed-assets-kpi', 'fixed-assets-by-category', 'depreciation-due', 'top-assets',
  'profitability-per-sku',
]);

const KEUANGAN_WIDGETS = ['revenue-chart', 'monthly-profit', 'cash-flow-summary', 'financial-ratios', 'expense-breakdown', 'aging-summary', 'overdue-invoices', 'top-vendors'];
const SALES_WIDGETS = ['top-customers', 'recent-activities', 'profitability-per-sku', 'upcoming-due'];
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

/**
 * Responsive grid that never leaves a hole: columns follow the number of widgets
 * actually rendered (hidden/disabled ones are `false`/null children).
 */
function WidgetGrid({ children, max = 2 }: { children: React.ReactNode; max?: 2 | 3 }) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  const cols =
    items.length === 1 ? 'grid-cols-1'
    : items.length === 2 || max === 2 ? 'grid-cols-1 lg:grid-cols-2'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  return <div className={`grid gap-4 ${cols}`}>{items}</div>;
}

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}

function SectionHeader({ icon: Icon, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="ml-2 h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export const Dashboard = () => {
  const { t } = useTranslation('dashboard');
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


  // Pemeliharaan: any EAM module (server re-checks each source) — independent of 'reports'.
  const canMaintenance = useMemo(() => canViewMaintenance(), []);
  // COGS backfill API is gated by the 'journal' module.
  const canCogs = useMemo(() => can('journal', 'view'), []);

  const availableWidgets = useMemo(
    () => defaultWidgets(t).filter(
      (w) => (canFinance || !FINANCE_WIDGET_IDS.has(w.id))
        && (canMaintenance || w.id !== 'maintenance')
        && (canCogs || w.id !== 'cogs-backfill'),
    ),
    [canFinance, canMaintenance, canCogs, t]
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

  // Period persisted to localStorage. Non-custom presets are always recomputed from today on load
  // so a saved "Bulan Ini" never queries a stale range; only 'custom' keeps its literal dates.
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

  // One-month periods make the revenue chart a single point: show the trailing 6 months instead.
  const singleMonth = period.startDate.slice(0, 7) === period.endDate.slice(0, 7);
  const trailingStart = useMemo(() => {
    const [y, m] = period.endDate.split('-').map(Number);
    const d = new Date(y, m - 6, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, [period.endDate]);
  const trailing = useQuery({
    queryKey: ['dashboard-charts', trailingStart, period.endDate],
    queryFn: async () => (await api.get('/dashboard/charts', { params: { startDate: trailingStart, endDate: period.endDate } })).data,
    enabled: canFinance && singleMonth,
  });

  const showKeuangan = canFinance && anyEnabled(KEUANGAN_WIDGETS);
  const showSales = canFinance && anyEnabled(SALES_WIDGETS);
  const showStok = anyEnabled(canCogs ? STOK_WIDGETS : STOK_WIDGETS.filter((id) => id !== 'cogs-backfill'));
  const showProduksi = anyEnabled(PRODUKSI_WIDGETS);
  const showAset = canFinance && anyEnabled(ASET_WIDGETS);

  const sections: SectionDef[] = useMemo(() => {
    const list: SectionDef[] = [{ id: 'overview', label: t('dashboardPage.nav.overview'), icon: LayoutDashboard }];
    if (showKeuangan) list.push({ id: 'keuangan', label: t('dashboardPage.nav.finance'), icon: Landmark });
    if (showSales) list.push({ id: 'sales', label: t('dashboardPage.nav.sales'), icon: TrendingUp });
    if (showStok) list.push({ id: 'stok', label: t('dashboardPage.nav.stock'), icon: Package });
    if (showProduksi) list.push({ id: 'produksi', label: t('dashboardPage.nav.production'), icon: Factory });
    if (showAset) list.push({ id: 'aset', label: t('dashboardPage.nav.assets'), icon: Building2 });
    return list;
  }, [showKeuangan, showSales, showStok, showProduksi, showAset, t]);

  const showAttention = isEnabled('attention-list');
  const showMaintenance = canMaintenance && isEnabled('maintenance');
  const showRevenue = canFinance && isEnabled('revenue-chart');

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t('dashboardPage.title')}
        icon={LayoutDashboard}
        description={
          isStaffProduksi
            ? t('dashboardPage.descriptionProduction', { company: company?.companyName || t('dashboardPage.yourCompany') })
            : t('dashboardPage.description', { company: company?.companyName || t('dashboardPage.yourCompany') })
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
              aria-label={t('dashboardPage.configure')}
              title={t('dashboardPage.configure')}
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

      {/* SECTION: OVERVIEW */}
      <section id="overview" role="tabpanel" aria-labelledby={tabId('overview')} className="space-y-4 scroll-mt-20">
        <SectionHeader icon={LayoutDashboard} title={t('dashboardPage.nav.overview')} subtitle={t('dashboardPage.sections.overview')} />
        <KPICards period={period} canFinance={canFinance} canMaintenance={showMaintenance} />
        {(showRevenue || showAttention) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {showRevenue && (
              <div className={showAttention ? 'min-w-0 lg:col-span-2' : 'min-w-0 lg:col-span-3'}>
                <Lazy height={330}>
                  {singleMonth ? (
                    <RevenueChart
                      data={trailing.data}
                      loading={trailing.isLoading}
                      isError={trailing.isError}
                      onRetry={() => void trailing.refetch()}
                      description={t('dashboardPage.trailingDescription')}
                    />
                  ) : (
                    <RevenueChart data={chartData} loading={isChartsLoading} isError={isChartsError} onRetry={() => void refetchCharts()} />
                  )}
                </Lazy>
              </div>
            )}
            {showAttention && (
              <div className={showRevenue ? 'min-w-0' : 'min-w-0 lg:col-span-3'}>
                <AttentionList canFinance={canFinance} canApprovals={canApprovals} canMaintenance={showMaintenance} />
              </div>
            )}
          </div>
        )}
        <WidgetGrid>
          {canFinance && isEnabled('cash-position') && <CashPositionWidget />}
          {showMaintenance && <MaintenanceUpcoming />}
        </WidgetGrid>
      </section>

      {/* SECTION: KEUANGAN */}
      {showKeuangan && (
        <section id="keuangan" role="tabpanel" aria-labelledby={tabId('keuangan')} className="space-y-4 scroll-mt-20">
          <SectionHeader icon={Landmark} title={t('dashboardPage.nav.finance')} subtitle={t('dashboardPage.sections.finance')} />

          <WidgetGrid>
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
          </WidgetGrid>

          <WidgetGrid max={3}>
            {isEnabled('cash-flow-summary') && <CashFlowChart startDate={period.startDate} endDate={period.endDate} />}
            {isEnabled('financial-ratios') && <FinancialRatios />}
            {isEnabled('aging-summary') && <AgingSummary />}
          </WidgetGrid>

          <WidgetGrid>
            {isEnabled('overdue-invoices') && <OverdueInvoices />}
            {isEnabled('top-vendors') && <TopVendors />}
          </WidgetGrid>
        </section>
      )}

      {/* SECTION: SALES */}
      {showSales && (
        <section id="sales" role="tabpanel" aria-labelledby={tabId('sales')} className="space-y-4 scroll-mt-20">
          <SectionHeader icon={TrendingUp} title={t('dashboardPage.nav.sales')} subtitle={t('dashboardPage.sections.sales')} />

          <WidgetGrid>
            {isEnabled('top-customers') && <TopCustomers />}
            {isEnabled('recent-activities') && (
              <RecentActivities
                data={recentActivities || null}
                isLoading={isActivitiesLoading}
                isError={isActivitiesError}
                onRetry={() => void refetchActivities()}
              />
            )}
          </WidgetGrid>

          <WidgetGrid>
            <PendingDOWidget />
            {isEnabled('upcoming-due') && <UpcomingDueInvoices />}
          </WidgetGrid>

          {isEnabled('profitability-per-sku') && (
            <ProfitabilityPerSku startDate={period.startDate} endDate={period.endDate} />
          )}
        </section>
      )}

      {/* SECTION: STOK & GUDANG */}
      {showStok && (
        <section id="stok" role="tabpanel" aria-labelledby={tabId('stok')} className="space-y-4 scroll-mt-20">
          <SectionHeader icon={Package} title={t('dashboardPage.sections.stockTitle')} subtitle={t('dashboardPage.sections.stock')} />

          {isEnabled('warehouse-kpi') && <WarehouseKPICards />}

          {(isEnabled('movement-trend') || isEnabled('category-distribution')) && (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
              {isEnabled('movement-trend') && (
                <div className={isEnabled('category-distribution') ? 'min-w-0 lg:col-span-2' : 'min-w-0 lg:col-span-3'}>
                  <Lazy height={330}>
                    <MovementTrendChart />
                  </Lazy>
                </div>
              )}
              {isEnabled('category-distribution') && (
                <div className={isEnabled('movement-trend') ? 'min-w-0' : 'min-w-0 lg:col-span-3'}>
                  <CategoryDistribution />
                </div>
              )}
            </div>
          )}

          <WidgetGrid>
            {isEnabled('top-items') && <TopItemsByStock />}
            {isEnabled('recent-movements') && <RecentMovements />}
          </WidgetGrid>

          {isEnabled('stock-alert') && (
            <WidgetGrid>
              <StockAlert />
              <NegativeStockWidget />
            </WidgetGrid>
          )}

          {canCogs && isEnabled('cogs-backfill') && <CogsBackfillWidget />}
        </section>
      )}

      {/* SECTION: PRODUKSI */}
      {showProduksi && (
        <section id="produksi" role="tabpanel" aria-labelledby={tabId('produksi')} className="space-y-4 scroll-mt-20">
          <SectionHeader icon={Factory} title={t('dashboardPage.nav.production')} subtitle={t('dashboardPage.sections.production')} />

          {(isEnabled('production-stats') || isEnabled('yield-trend')) && (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
              {isEnabled('production-stats') && (
                <div className={isEnabled('yield-trend') ? 'min-w-0' : 'min-w-0 lg:col-span-3'}>
                  <ProductionStatsWidget />
                </div>
              )}
              {isEnabled('yield-trend') && (
                <div className={isEnabled('production-stats') ? 'min-w-0 lg:col-span-2' : 'min-w-0 lg:col-span-3'}>
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

      {/* SECTION: ASET TETAP */}
      {showAset && (
        <section id="aset" role="tabpanel" aria-labelledby={tabId('aset')} className="space-y-4 scroll-mt-20">
          <SectionHeader icon={Building2} title={t('dashboardPage.sections.assetsTitle')} subtitle={t('dashboardPage.sections.assets')} />

          {isEnabled('fixed-assets-kpi') && <FixedAssetsKPI />}

          <WidgetGrid>
            {isEnabled('fixed-assets-by-category') && (
              <Lazy height={330}>
                <FixedAssetsByCategory />
              </Lazy>
            )}
            {isEnabled('depreciation-due') && <DepreciationDue />}
          </WidgetGrid>

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
