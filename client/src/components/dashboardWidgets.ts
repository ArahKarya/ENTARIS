import type React from 'react';
import type { TFunction } from 'i18next';
import type dashboardId from '@/locales/id/dashboard.json';
import { BarChart3, Clock, Users, AlertTriangle, PieChart, PackageX, Package, ArrowLeftRight, Layers, Factory, TrendingUp, Wallet, Scale, Truck, Percent, Building2, CalendarClock, Trophy, Calculator, Wrench } from 'lucide-react';

export interface WidgetConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
}

type CatalogKey = keyof (typeof dashboardId)['widgetCatalog'];

interface WidgetDef {
  id: string;
  /** Key under `dashboard:widgetCatalog`; name and description are translated when the list is built. */
  key: CatalogKey;
  icon: React.ElementType;
  enabled: boolean;
}

const WIDGET_DEFS: WidgetDef[] = [
  { id: 'attention-list', key: 'attentionList', icon: AlertTriangle, enabled: true },
  { id: 'revenue-chart', key: 'revenueChart', icon: BarChart3, enabled: true },
  { id: 'recent-activities', key: 'recentActivities', icon: Clock, enabled: true },
  { id: 'top-customers', key: 'topCustomers', icon: Users, enabled: true },
  { id: 'overdue-invoices', key: 'overdueInvoices', icon: AlertTriangle, enabled: true },
  { id: 'expense-breakdown', key: 'expenseBreakdown', icon: PieChart, enabled: true },
  { id: 'stock-alert', key: 'stockAlert', icon: PackageX, enabled: true },
  { id: 'warehouse-kpi', key: 'warehouseKpi', icon: Package, enabled: true },
  { id: 'movement-trend', key: 'movementTrend', icon: BarChart3, enabled: true },
  { id: 'category-distribution', key: 'categoryDistribution', icon: Layers, enabled: true },
  { id: 'top-items', key: 'topItems', icon: Package, enabled: true },
  { id: 'recent-movements', key: 'recentMovements', icon: ArrowLeftRight, enabled: true },
  { id: 'production-stats', key: 'productionStats', icon: Factory, enabled: true },
  { id: 'financial-ratios', key: 'financialRatios', icon: Scale, enabled: true },
  { id: 'monthly-profit', key: 'monthlyProfit', icon: TrendingUp, enabled: true },
  { id: 'cash-flow-summary', key: 'cashFlowSummary', icon: Wallet, enabled: true },
  { id: 'aging-summary', key: 'agingSummary', icon: Clock, enabled: true },
  { id: 'cash-position', key: 'cashPosition', icon: Wallet, enabled: true },
  { id: 'top-vendors', key: 'topVendors', icon: Truck, enabled: true },
  { id: 'yield-trend', key: 'yieldTrend', icon: Percent, enabled: true },
  { id: 'cogs-backfill', key: 'cogsBackfill', icon: AlertTriangle, enabled: true },
  { id: 'maintenance', key: 'maintenance', icon: Wrench, enabled: true },
  { id: 'upcoming-due', key: 'upcomingDue', icon: CalendarClock, enabled: true },
  // Aset Tetap
  { id: 'fixed-assets-kpi', key: 'fixedAssetsKpi', icon: Building2, enabled: true },
  { id: 'fixed-assets-by-category', key: 'fixedAssetsByCategory', icon: PieChart, enabled: true },
  { id: 'depreciation-due', key: 'depreciationDue', icon: CalendarClock, enabled: true },
  { id: 'top-assets', key: 'topAssets', icon: Trophy, enabled: true },
  // Sales lanjutan
  { id: 'profitability-per-sku', key: 'profitabilityPerSku', icon: Calculator, enabled: true },
  // Produksi lanjutan
  { id: 'production-deep-dive', key: 'productionDeepDive', icon: Factory, enabled: true },
];

/** Widget catalog translated with the caller's `dashboard` t (so it follows language changes). */
export function defaultWidgets(t: TFunction<'dashboard'>): WidgetConfig[] {
  return WIDGET_DEFS.map(({ key, ...w }) => ({
    ...w,
    name: t(`widgetCatalog.${key}.name`),
    description: t(`widgetCatalog.${key}.description`),
  }));
}
