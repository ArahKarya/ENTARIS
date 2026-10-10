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
import type { StatusTone } from '../../lib/status';

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

const PRIORITY_META: Record<WoPriority, { label: string; tone: StatusTone }> = {
  URGENT: { label: 'Mendesak', tone: 'danger' },
  HIGH: { label: 'Tinggi', tone: 'warning' },
  MEDIUM: { label: 'Sedang', tone: 'info' },
  LOW: { label: 'Rendah', tone: 'neutral' },
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

const SectionLink = ({ to }: { to: string }) => (
  <Link
    to={to}
    className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    Lihat semua <ArrowRight className="size-3" aria-hidden />
  </Link>
);

export const GaDashboardPage = () => {
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
        title="Ringkasan Aset & Pemeliharaan"
        description="Ringkasan aset tetap, kondisi aset, dan pekerjaan pemeliharaan yang masih aktif."
        className="pb-0"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Boxes}
          label="Total Aset Tetap"
          loading={loadingCategories}
          value={canViewFixedAssets ? formatNumber(totals.totalAssetCount) : '—'}
          hint={canViewFixedAssets ? `${formatNumber(categorySummary.length)} kategori` : 'Butuh akses Aset Tetap'}
        />
        <StatCard
          icon={Wallet}
          label="Nilai Buku"
          loading={loadingCategories}
          value={canViewFixedAssets ? formatRupiah(totals.totalBookValue, { compact: true }) : '—'}
          valueTitle={canViewFixedAssets ? formatRupiah(totals.totalBookValue) : undefined}
          hint={canViewFixedAssets ? `Harga perolehan ${formatRupiah(totals.totalCost, { compact: true })}` : 'Butuh akses Aset Tetap'}
        />
        <StatCard
          icon={Wrench}
          label="Perintah Kerja Aktif"
          loading={loadingWorkOrders}
          value={canViewMaintenance ? formatNumber(woStats.active.length) : '—'}
          hint={canViewMaintenance ? `${formatNumber(woStats.urgent.length)} prioritas tinggi/mendesak` : 'Butuh akses Pemeliharaan'}
          href={canViewMaintenance ? '/ga/maintenance' : undefined}
        />
        <StatCard
          icon={AlertTriangle}
          label="Perintah Kerja Terlambat"
          loading={loadingWorkOrders || assetQuery.isLoading}
          value={canViewMaintenance ? formatNumber(woStats.overdue.length) : '—'}
          hint={
            poorConditionCount > 0
              ? `${formatNumber(poorConditionCount)} aset kondisi kurang/rusak`
              : 'Semua aset kondisi baik'
          }
          className={cn(woStats.overdue.length > 0 && 'border-danger')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fixed assets per category */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Aset Tetap per Kategori</h2>
            <SectionLink to="/ga/assets" />
          </div>
          {!canViewFixedAssets ? (
            <EmptyState compact title="Tidak ada akses" description="Ringkasan ini butuh hak lihat Aset Tetap." />
          ) : loadingCategories ? (
            <LoadingState size="sm" label="Memuat ringkasan…" />
          ) : categoryQuery.isError ? (
            <EmptyState compact kind="error" />
          ) : sortedCategories.length === 0 ? (
            <EmptyState compact icon={Boxes} title="Belum ada aset tetap" description="Aset tetap yang tercatat akan muncul di sini." />
          ) : (
            <ul className="space-y-2.5">
              {sortedCategories.map((c) => {
                const pct = totals.totalBookValue > 0 ? (c.total_book_value / totals.totalBookValue) * 100 : 0;
                return (
                  <li key={c.category}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-foreground">{c.category}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatNumber(c.count)} aset · {formatRupiah(c.total_book_value)}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-sm bg-muted"
                      role="progressbar"
                      aria-label={`Porsi nilai buku ${c.category}`}
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
            <h2 className="text-sm font-semibold text-foreground">Perintah Kerja Aktif</h2>
            {canViewMaintenance && <SectionLink to="/ga/maintenance" />}
          </div>
          {!canViewMaintenance ? (
            <EmptyState compact title="Tidak ada akses" description="Daftar ini butuh hak lihat Pemeliharaan." />
          ) : loadingWorkOrders ? (
            <LoadingState size="sm" label="Memuat ringkasan…" />
          ) : workOrderQuery.isError ? (
            <EmptyState compact kind="error" />
          ) : woStats.active.length === 0 ? (
            <EmptyState compact icon={Wrench} title="Tidak ada perintah kerja aktif" description="Semua pekerjaan pemeliharaan sudah selesai." />
          ) : (
            <ul className="space-y-2">
              {woStats.active.slice(0, MAX_WO_ROWS).map((w) => {
                const overdue = isOverdue(w, woStats.now);
                const priority = PRIORITY_META[w.priority] ?? PRIORITY_META.LOW;
                return (
                  <li key={w.id}>
                    <Link
                      to="/ga/maintenance"
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{w.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {w.code} · {w.asset?.name ?? 'Tanpa aset'}
                          {overdue && <span className="font-medium text-danger-text"> · Terlambat</span>}
                        </p>
                      </div>
                      <StatusBadge label={priority.label} tone={priority.tone} dot={false} className="shrink-0" />
                    </Link>
                  </li>
                );
              })}
              {woStats.active.length > MAX_WO_ROWS && (
                <li className="pt-1 text-center text-xs text-muted-foreground">
                  +{formatNumber(woStats.active.length - MAX_WO_ROWS)} lainnya
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick links */}
      {quickLinks.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Akses Cepat</h2>
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
