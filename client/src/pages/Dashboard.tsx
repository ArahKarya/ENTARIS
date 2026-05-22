import { useState, useCallback, useMemo, useEffect } from 'react';
import { Settings2, LayoutDashboard, DollarSign, TrendingUp, Package, Factory, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useCompanySettings } from '../contexts/CompanySettingsContext';

// Widgets
import KPICards from '../components/widgets/KPICards';
import RevenueChart from '../components/widgets/RevenueChart';
import RecentActivities from '../components/widgets/RecentActivities';
import TopCustomers from '../components/widgets/TopCustomers';
import OverdueInvoices from '../components/widgets/OverdueInvoices';
import ExpenseBreakdown from '../components/widgets/ExpenseBreakdown';
import StockAlert from '../components/widgets/StockAlert';
import NegativeStockWidget from '../components/widgets/NegativeStockWidget';
import WarehouseKPICards from '../components/widgets/WarehouseKPICards';
import MovementTrendChart from '../components/widgets/MovementTrendChart';
import CategoryDistribution from '../components/widgets/CategoryDistribution';
import TopItemsByStock from '../components/widgets/TopItemsByStock';
import RecentMovements from '../components/widgets/RecentMovements';
import ProductionStatsWidget from '../components/widgets/ProductionStatsWidget';
import ProductionDeepDive from '../components/widgets/ProductionDeepDive';
import FixedAssetsKPI from '../components/widgets/FixedAssetsKPI';
import FixedAssetsByCategory from '../components/widgets/FixedAssetsByCategory';
import DepreciationDue from '../components/widgets/DepreciationDue';
import TopAssetsByValue from '../components/widgets/TopAssetsByValue';
import ProfitabilityPerSku from '../components/widgets/ProfitabilityPerSku';
import FinancialRatios from '../components/widgets/FinancialRatios';
import MonthlyProfitChart from '../components/widgets/MonthlyProfitChart';
import CashFlowChart from '../components/widgets/CashFlowChart';
import AgingSummary from '../components/widgets/AgingSummary';
import CashPositionWidget from '../components/widgets/CashPositionWidget';
import TopVendors from '../components/widgets/TopVendors';
import YieldTrendChart from '../components/widgets/YieldTrendChart';
import CogsBackfillWidget from '../components/widgets/CogsBackfillWidget';
import DashboardSettings, { DEFAULT_WIDGETS, type WidgetConfig } from '../components/DashboardSettings';
import DashboardSectionNav, { type SectionDef } from '../components/DashboardSectionNav';
import DashboardPeriodFilter, { type PeriodRange, computePresetRange } from '../components/DashboardPeriodFilter';

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}

function SectionHeader({ icon: Icon, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}
      >
        <Icon size={16} style={{ color: 'var(--color-text-secondary)' }} />
      </div>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>
        )}
      </div>
      <div className="h-px flex-1 ml-2" style={{ backgroundColor: 'var(--color-border)' }} />
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

  const availableWidgets = useMemo(
    () => isStaffProduksi
      ? DEFAULT_WIDGETS.filter((w) => !FINANCE_WIDGET_IDS.has(w.id))
      : DEFAULT_WIDGETS,
    [isStaffProduksi]
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

  // Period filter state (persisted to localStorage)
  const [period, setPeriod] = useState<PeriodRange>(() => {
    try {
      const raw = localStorage.getItem('dashboard-period');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    const def = computePresetRange('thisMonth');
    return { preset: 'thisMonth', ...def };
  });
  useEffect(() => {
    try { localStorage.setItem('dashboard-period', JSON.stringify(period)); } catch { /* ignore */ }
  }, [period]);

  const periodParams = { startDate: period.startDate, endDate: period.endDate };

  // Data queries (period-aware)
  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: ['dashboard-metrics', period.startDate, period.endDate],
    queryFn: async () => {
      const r = await api.get('/dashboard/metrics', { params: periodParams });
      return r.data;
    },
  });

  const { data: chartData, isLoading: isChartsLoading } = useQuery({
    queryKey: ['dashboard-charts', period.startDate, period.endDate],
    queryFn: async () => {
      const r = await api.get('/dashboard/charts', { params: periodParams });
      return r.data;
    },
  });

  const { data: recentActivities } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: async () => {
      const r = await api.get('/payments');
      const list = r.data.data ?? r.data;
      return Array.isArray(list) ? list.slice(0, 6) : [];
    },
  });

  const showKeuangan = !isStaffProduksi && anyEnabled(KEUANGAN_WIDGETS);
  const showSales = !isStaffProduksi && anyEnabled(SALES_WIDGETS);
  const showStok = anyEnabled(STOK_WIDGETS);
  const showProduksi = anyEnabled(PRODUKSI_WIDGETS);
  const showAset = !isStaffProduksi && anyEnabled(ASET_WIDGETS);

  const sections: SectionDef[] = useMemo(() => {
    const list: SectionDef[] = [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }];
    if (showKeuangan) list.push({ id: 'keuangan', label: 'Keuangan', icon: DollarSign });
    if (showSales) list.push({ id: 'sales', label: 'Sales', icon: TrendingUp });
    if (showStok) list.push({ id: 'stok', label: 'Stok', icon: Package });
    if (showProduksi) list.push({ id: 'produksi', label: 'Produksi', icon: Factory });
    if (showAset) list.push({ id: 'aset', label: 'Aset', icon: Building2 });
    return list;
  }, [showKeuangan, showSales, showStok, showProduksi, showAset]);

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <LayoutDashboard className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">
              {isStaffProduksi ? 'Dashboard Gudang & Produksi' : 'Dashboard'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isStaffProduksi
                ? `Ringkasan stok, gudang & produksi ${company?.companyName || 'perusahaan Anda'}`
                : `Ringkasan keuangan ${company?.companyName || 'perusahaan Anda'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DashboardPeriodFilter value={period} onChange={setPeriod} />
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-md border border-border bg-card transition-colors hover:bg-accent text-muted-foreground"
            title="Konfigurasi Dashboard"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>

      {/* Sticky Section Nav */}
      <DashboardSectionNav sections={sections} />

      {/* ─────────── SECTION: OVERVIEW ─────────── */}
      <section id="overview" className="space-y-4 scroll-mt-20">
        <SectionHeader
          icon={LayoutDashboard}
          title="Overview"
          subtitle="Ringkasan performa utama"
        />
        <KPICards data={metrics} loading={isMetricsLoading} />
        {!isStaffProduksi && isEnabled('cash-position') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CashPositionWidget />
          </div>
        )}
      </section>

      {/* ─────────── SECTION: KEUANGAN ─────────── */}
      {showKeuangan && (
        <section id="keuangan" className="space-y-4 scroll-mt-20">
          <SectionHeader
            icon={DollarSign}
            title="Keuangan"
            subtitle="Pendapatan, laba, arus kas & rasio"
          />

          {(isEnabled('revenue-chart') || isEnabled('monthly-profit')) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {isEnabled('revenue-chart') && (
                <RevenueChart data={chartData} loading={isChartsLoading} />
              )}
              {isEnabled('monthly-profit') && <MonthlyProfitChart startDate={period.startDate} endDate={period.endDate} />}
            </div>
          )}

          {(isEnabled('cash-flow-summary') || isEnabled('financial-ratios') || isEnabled('expense-breakdown')) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isEnabled('cash-flow-summary') && <CashFlowChart startDate={period.startDate} endDate={period.endDate} />}
              {isEnabled('financial-ratios') && <FinancialRatios />}
              {isEnabled('expense-breakdown') && <ExpenseBreakdown startDate={period.startDate} endDate={period.endDate} />}
            </div>
          )}

          {(isEnabled('aging-summary') || isEnabled('overdue-invoices')) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {isEnabled('aging-summary') && <AgingSummary />}
              {isEnabled('overdue-invoices') && <OverdueInvoices />}
            </div>
          )}

          {isEnabled('top-vendors') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TopVendors />
            </div>
          )}
        </section>
      )}

      {/* ─────────── SECTION: SALES ─────────── */}
      {showSales && (
        <section id="sales" className="space-y-4 scroll-mt-20">
          <SectionHeader
            icon={TrendingUp}
            title="Sales"
            subtitle="Pelanggan & aktivitas pembayaran"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isEnabled('top-customers') && <TopCustomers />}
            {isEnabled('recent-activities') && (
              <RecentActivities data={recentActivities || null} />
            )}
          </div>

          {isEnabled('profitability-per-sku') && (
            <ProfitabilityPerSku startDate={period.startDate} endDate={period.endDate} />
          )}
        </section>
      )}

      {/* ─────────── SECTION: STOK & GUDANG ─────────── */}
      {showStok && (
        <section id="stok" className="space-y-4 scroll-mt-20">
          <SectionHeader
            icon={Package}
            title="Stok & Gudang"
            subtitle="Inventori, pergerakan & peringatan stok"
          />

          {isEnabled('warehouse-kpi') && <WarehouseKPICards />}

          {(isEnabled('movement-trend') || isEnabled('category-distribution')) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {isEnabled('movement-trend') && (
                <div className="lg:col-span-2">
                  <MovementTrendChart />
                </div>
              )}
              {isEnabled('category-distribution') && <CategoryDistribution />}
            </div>
          )}

          {(isEnabled('top-items') || isEnabled('recent-movements')) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isEnabled('top-items') && <TopItemsByStock />}
              {isEnabled('recent-movements') && <RecentMovements />}
            </div>
          )}

          {isEnabled('stock-alert') && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <StockAlert />
              <NegativeStockWidget />
            </div>
          )}

          {isEnabled('cogs-backfill') && <CogsBackfillWidget />}
        </section>
      )}

      {/* ─────────── SECTION: PRODUKSI ─────────── */}
      {showProduksi && (
        <section id="produksi" className="space-y-4 scroll-mt-20">
          <SectionHeader
            icon={Factory}
            title="Produksi"
            subtitle="Statistik produksi & yield"
          />

          {isEnabled('production-stats') && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ProductionStatsWidget />
            </div>
          )}

          {isEnabled('yield-trend') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <YieldTrendChart />
            </div>
          )}

          {isEnabled('production-deep-dive') && (
            <ProductionDeepDive startDate={period.startDate} endDate={period.endDate} />
          )}
        </section>
      )}

      {/* ─────────── SECTION: ASET TETAP ─────────── */}
      {showAset && (
        <section id="aset" className="space-y-4 scroll-mt-20">
          <SectionHeader
            icon={Building2}
            title="Aset Tetap"
            subtitle="Nilai aset, distribusi, dan jadwal penyusutan"
          />

          {isEnabled('fixed-assets-kpi') && <FixedAssetsKPI />}

          {(isEnabled('fixed-assets-by-category') || isEnabled('depreciation-due')) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {isEnabled('fixed-assets-by-category') && <FixedAssetsByCategory />}
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
