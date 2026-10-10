// Asset & maintenance overview — home of the GA/EAM module (ported from the
// former standalone EAM app's dashboard). Pure client-side aggregation of
// existing endpoints: /fixed-assets/summary/by-category,
// /ga/maintenance/work-orders and /ga/assets. Each query only runs when the
// user can view its module, so GA roles without accounting access get no 403.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Boxes, Wallet, Wrench } from 'lucide-react';
import api from '../../lib/api';
import { can } from '../../lib/permissions';
import { formatNumber, formatRupiah } from '../../lib/format';
import { cn } from '../../lib/utils';
import { getRoute } from '../../app/routes';
import { Card } from '../../components/ui/card';
import { EmptyState, LoadingState, PageHeader, StatCard, StatusBadge } from '../../components/shared';
import { useTranslation } from 'react-i18next';
import type { StatusTone } from '../../lib/status';
import { tEam } from '../../components/ga/eam-i18n';

interface CategorySummary {
  category: string;
  count: number;
  total_cost: number;
  total_accumulated: number;
  total_book_value: number;
}

type WoStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'CANCELLED';
type WoPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface WorkOrder {
  id: string;
  code: string;
  status: WoStatus;
  priority: WoPriority;
  title: string;
  dueAt: string | null;
  asset?: { code: string; name: string } | null;
}

interface GaAsset {
  id: string;
  status: string;
  condition: string;
  category?: { name?: string } | null;
}

const ACTIVE_WO_STATUSES = new Set<WoStatus>(['OPEN', 'ASSIGNED', 'IN_PROGRESS']);
const MAX_WO_ROWS = 6;

const PRIORITY_TONE: Record<WoPriority, StatusTone> = { URGENT: 'danger', HIGH: 'warning', MEDIUM: 'info', LOW: 'neutral' };
const priorityMeta = (p: WoPriority): { label: string; tone: StatusTone } => {
  const priority = PRIORITY_TONE[p] ? p : 'LOW';
  return { label: tEam(`workOrder.priority.${priority}`), tone: PRIORITY_TONE[priority] };
};

/** Shortcuts to existing GA pages; label & icon come from the route registry. */
const QUICK_LINK_PATHS = [
  '/ga/assets',
  '/ga/vehicle',
  '/ga/building',
  '/ga/equipment',
  '/ga/maintenance',
  '/ga/material-requests',
] as const;

const isOverdue = (wo: WorkOrder, now: Date) => !!wo.dueAt && new Date(wo.dueAt) < now;

const SectionLink = ({ to }: { to: string }) => {
  const { t } = useTranslation('eam');
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {t('gaDashboard.viewAll')} <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
};

export const GaDashboardPage = () => {
  const { t } = useTranslation('eam');
  const canViewFixedAssets = can('fixed_assets', 'view');
  const canViewMaintenance = can('ga_maintenance', 'view');

  const categoryQuery = useQuery<CategorySummary[]>({
    queryKey: ['ga-dashboard', 'fixed-assets-summary'],
    queryFn: async () => (await api.get('/fixed-assets/summary/by-category')).data,
    enabled: canViewFixedAssets,
  });

  const workOrderQuery = useQuery<WorkOrder[]>({
    queryKey: ['ga-dashboard', 'work-orders'],
    queryFn: async () => (await api.get('/ga/maintenance/work-orders')).data,
    enabled: canViewMaintenance,
  });

  const assetQuery = useQuery<GaAsset[]>({
    queryKey: ['ga-dashboard', 'assets'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500 } })).data,
  });

  const categorySummary = useMemo(() => categoryQuery.data ?? [], [categoryQuery.data]);
  const workOrders = useMemo(() => workOrderQuery.data ?? [], [workOrderQuery.data]);
  const assets = useMemo(() => assetQuery.data ?? [], [assetQuery.data]);

  const totals = useMemo(() => {
    const totalAssetCount = categorySummary.reduce((sum, c) => sum + c.count, 0);
    const totalBookValue = categorySummary.reduce((sum, c) => sum + c.total_book_value, 0);
    const totalCost = categorySummary.reduce((sum, c) => sum + c.total_cost, 0);
    return { totalAssetCount, totalBookValue, totalCost };
  }, [categorySummary]);

  const sortedCategories = useMemo(
    () => [...categorySummary].sort((a, b) => b.total_book_value - a.total_book_value),
    [categorySummary],
  );

  const woStats = useMemo(() => {
    const now = new Date();
    const active = workOrders.filter((w) => ACTIVE_WO_STATUSES.has(w.status));
    const overdue = active.filter((w) => isOverdue(w, now));
    const urgent = active.filter((w) => w.priority === 'URGENT' || w.priority === 'HIGH');
    return { active, overdue, urgent, now };
  }, [workOrders]);

  const poorConditionCount = useMemo(
    () => assets.filter((a) => a.condition === 'POOR' || a.condition === 'BROKEN').length,
    [assets],
  );

  const quickLinks = QUICK_LINK_PATHS.map((path) => getRoute(path)).filter(
    (entry): entry is NonNullable<typeof entry> => !!entry && (!entry.module || can(entry.module, 'view')),
  );

  const loadingCategories = canViewFixedAssets && categoryQuery.isLoading;
  const loadingWorkOrders = canViewMaintenance && workOrderQuery.isLoading;

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t('gaDashboard.title')}
        description={t('gaDashboard.description')}
        className="pb-0"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Boxes}
          label={t('gaDashboard.kpiFixedAssets')}
          loading={loadingCategories}
          value={canViewFixedAssets ? formatNumber(totals.totalAssetCount) : '—'}
          hint={canViewFixedAssets ? t('gaDashboard.categories', { count: categorySummary.length, n: formatNumber(categorySummary.length) }) : t('gaDashboard.needFixedAssets')}
        />
        <StatCard
          icon={Wallet}
          label={t('gaDashboard.kpiBookValue')}
          loading={loadingCategories}
          value={canViewFixedAssets ? formatRupiah(totals.totalBookValue, { compact: true }) : '—'}
          valueTitle={canViewFixedAssets ? formatRupiah(totals.totalBookValue) : undefined}
          hint={canViewFixedAssets ? t('gaDashboard.acquisitionCost', { amount: formatRupiah(totals.totalCost, { compact: true }) }) : t('gaDashboard.needFixedAssets')}
        />
        <StatCard
          icon={Wrench}
          label={t('gaDashboard.kpiActiveWo')}
          loading={loadingWorkOrders}
          value={canViewMaintenance ? formatNumber(woStats.active.length) : '—'}
          hint={canViewMaintenance ? t('gaDashboard.highPriority', { n: formatNumber(woStats.urgent.length) }) : t('gaDashboard.needMaintenance')}
          href={canViewMaintenance ? '/ga/maintenance' : undefined}
        />
        <StatCard
          icon={AlertTriangle}
          label={t('gaDashboard.kpiOverdueWo')}
          loading={loadingWorkOrders || assetQuery.isLoading}
          value={canViewMaintenance ? formatNumber(woStats.overdue.length) : '—'}
          hint={
            poorConditionCount > 0
              ? t('gaDashboard.poorCondition', { n: formatNumber(poorConditionCount) })
              : t('gaDashboard.allGood')
          }
          className={cn(woStats.overdue.length > 0 && 'border-danger')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fixed assets per category */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('gaDashboard.byCategory')}</h2>
            <SectionLink to="/ga/assets" />
          </div>
          {!canViewFixedAssets ? (
            <EmptyState compact title={t('shared.noAccess')} description={t('gaDashboard.needFixedAssetsDescription')} />
          ) : loadingCategories ? (
            <LoadingState size="sm" label={t('gaDashboard.loading')} />
          ) : categoryQuery.isError ? (
            <EmptyState compact kind="error" />
          ) : sortedCategories.length === 0 ? (
            <EmptyState compact icon={Boxes} title={t('gaDashboard.noFixedAssets')} description={t('gaDashboard.noFixedAssetsDescription')} />
          ) : (
            <ul className="space-y-2.5">
              {sortedCategories.map((c) => {
                const pct = totals.totalBookValue > 0 ? (c.total_book_value / totals.totalBookValue) * 100 : 0;
                return (
                  <li key={c.category}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-foreground">{c.category}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {t('gaDashboard.assetCount', { n: formatNumber(c.count), amount: formatRupiah(c.total_book_value) })}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-sm bg-muted"
                      role="progressbar"
                      aria-label={t('gaDashboard.bookValueShare', { name: c.category })}
                      aria-valuenow={Math.round(pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="h-full rounded-sm bg-primary" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Active work orders */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('gaDashboard.kpiActiveWo')}</h2>
            {canViewMaintenance && <SectionLink to="/ga/maintenance" />}
          </div>
          {!canViewMaintenance ? (
            <EmptyState compact title={t('shared.noAccess')} description={t('gaDashboard.needMaintenanceDescription')} />
          ) : loadingWorkOrders ? (
            <LoadingState size="sm" label={t('gaDashboard.loading')} />
          ) : workOrderQuery.isError ? (
            <EmptyState compact kind="error" />
          ) : woStats.active.length === 0 ? (
            <EmptyState compact icon={Wrench} title={t('gaDashboard.noActiveWo')} description={t('gaDashboard.noActiveWoDescription')} />
          ) : (
            <ul className="space-y-2">
              {woStats.active.slice(0, MAX_WO_ROWS).map((w) => {
                const overdue = isOverdue(w, woStats.now);
                const priority = priorityMeta(w.priority);
                return (
                  <li key={w.id}>
                    <Link
                      to="/ga/maintenance"
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{w.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {w.code} · {w.asset?.name ?? t('gaDashboard.noAsset')}
                          {overdue && <span className="font-medium text-danger-text"> · {t('gaDashboard.overdue')}</span>}
                        </p>
                      </div>
                      <StatusBadge label={priority.label} tone={priority.tone} dot={false} className="shrink-0" />
                    </Link>
                  </li>
                );
              })}
              {woStats.active.length > MAX_WO_ROWS && (
                <li className="pt-1 text-center text-xs text-muted-foreground">
                  {t('gaDashboard.more', { n: formatNumber(woStats.active.length - MAX_WO_ROWS) })}
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick links */}
      {quickLinks.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t('gaDashboard.quickAccess')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {quickLinks.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon size={20} className="text-primary" />
                <span className="text-xs text-foreground-secondary">{label}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default GaDashboardPage;
