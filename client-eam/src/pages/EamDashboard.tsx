// EAM Dashboard — ringkasan aset & maintenance, murni agregasi client-side
// dari endpoint GA/fixed-assets yang sudah ada (tidak ada endpoint baru).
// Lihat PRD EAM-Standalone-v0.1 Section 5 (Dashboard ringkas = MVP wajib).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes, Wallet, Wrench, AlertTriangle, Car, Building2, ScanLine,
  ClipboardList, ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatRupiah } from '../lib/formatters';

interface CategorySummary {
  category: string;
  count: number;
  total_cost: number;
  total_accumulated: number;
  total_book_value: number;
}

interface WorkOrder {
  id: string;
  code: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
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

const ACTIVE_WO_STATUSES = new Set(['OPEN', 'ASSIGNED', 'IN_PROGRESS']);

const PRIORITY_BADGE: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  LOW: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

const StatCard = ({
  icon: Icon, label, value, sub, tone = 'default',
}: {
  icon: React.FC<any>; label: string; value: string; sub?: string;
  tone?: 'default' | 'warning' | 'danger';
}) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      <Icon
        className={
          tone === 'danger' ? 'h-4 w-4 text-red-500' :
          tone === 'warning' ? 'h-4 w-4 text-amber-500' :
          'h-4 w-4 text-gray-400'
        }
      />
    </div>
    <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
    {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
  </div>
);

export const EamDashboard = () => {
  const { data: categorySummary = [], isLoading: catLoading } = useQuery<CategorySummary[]>({
    queryKey: ['eam-fixed-assets-summary'],
    queryFn: async () => (await api.get('/fixed-assets/summary/by-category')).data,
  });

  const { data: workOrders = [], isLoading: woLoading } = useQuery<WorkOrder[]>({
    queryKey: ['eam-work-orders-dashboard'],
    queryFn: async () => (await api.get('/ga/maintenance/work-orders')).data,
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery<GaAsset[]>({
    queryKey: ['eam-assets-dashboard'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500 } })).data,
  });

  const totals = useMemo(() => {
    const totalAssetCount = categorySummary.reduce((sum, c) => sum + c.count, 0);
    const totalBookValue = categorySummary.reduce((sum, c) => sum + c.total_book_value, 0);
    const totalCost = categorySummary.reduce((sum, c) => sum + c.total_cost, 0);
    return { totalAssetCount, totalBookValue, totalCost };
  }, [categorySummary]);

  const woStats = useMemo(() => {
    const active = workOrders.filter((w) => ACTIVE_WO_STATUSES.has(w.status));
    const now = new Date();
    const overdue = active.filter((w) => w.dueAt && new Date(w.dueAt) < now);
    const urgent = active.filter((w) => w.priority === 'URGENT' || w.priority === 'HIGH');
    return { active, overdue, urgent };
  }, [workOrders]);

  const conditionStats = useMemo(() => {
    const poor = assets.filter((a) => a.condition === 'POOR' || a.condition === 'BROKEN');
    return { poor };
  }, [assets]);

  const loading = catLoading || woLoading || assetsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Dashboard Aset & Maintenance</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ringkasan seluruh aset tetap, kondisi, dan pekerjaan maintenance aktif.
        </p>
      </div>

      {/* ── Top stat cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Boxes}
          label="Total Aset"
          value={loading ? '…' : totals.totalAssetCount.toLocaleString('id-ID')}
          sub={`${categorySummary.length} kategori`}
        />
        <StatCard
          icon={Wallet}
          label="Nilai Buku (NBV)"
          value={loading ? '…' : formatRupiah(totals.totalBookValue)}
          sub={`Harga perolehan ${formatRupiah(totals.totalCost)}`}
        />
        <StatCard
          icon={Wrench}
          label="Work Order Aktif"
          value={loading ? '…' : woStats.active.length.toLocaleString('id-ID')}
          sub={`${woStats.urgent.length} prioritas tinggi/urgent`}
          tone={woStats.urgent.length > 0 ? 'warning' : 'default'}
        />
        <StatCard
          icon={AlertTriangle}
          label="WO Overdue"
          value={loading ? '…' : woStats.overdue.length.toLocaleString('id-ID')}
          sub={conditionStats.poor.length > 0 ? `${conditionStats.poor.length} aset kondisi buruk` : 'Semua aset kondisi baik'}
          tone={woStats.overdue.length > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Breakdown per kategori ───────────────────────────── */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Aset per Kategori</h2>
            <Link to="/ga/assets" className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
              Lihat semua <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {catLoading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : categorySummary.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada data.</p>
          ) : (
            <div className="space-y-2.5">
              {categorySummary
                .slice()
                .sort((a, b) => b.total_book_value - a.total_book_value)
                .map((c) => {
                  const pct = totals.totalBookValue > 0 ? (c.total_book_value / totals.totalBookValue) * 100 : 0;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{c.category}</span>
                        <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                          {c.count} aset · {formatRupiah(c.total_book_value)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* ── Work order aktif terbaru ─────────────────────────── */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Work Order Aktif</h2>
            <Link to="/ga/maintenance" className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
              Lihat semua <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {woLoading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : woStats.active.length === 0 ? (
            <p className="text-sm text-gray-400">Tidak ada work order aktif. 🎉</p>
          ) : (
            <div className="space-y-2">
              {woStats.active.slice(0, 6).map((w) => {
                const overdue = w.dueAt && new Date(w.dueAt) < new Date();
                return (
                  <Link
                    key={w.id}
                    to="/ga/maintenance"
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{w.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {w.code} · {w.asset?.name ?? 'Tanpa aset'}
                        {overdue && <span className="text-red-500 font-medium"> · Overdue</span>}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[w.priority] ?? PRIORITY_BADGE.LOW}`}>
                      {w.priority}
                    </span>
                  </Link>
                );
              })}
              {woStats.active.length > 6 && (
                <p className="text-xs text-gray-400 text-center pt-1">+{woStats.active.length - 6} lainnya</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick links ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Akses Cepat</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link to="/ga/assets" className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-100 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <Boxes className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">Aset</span>
          </Link>
          <Link to="/ga/vehicle" className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-100 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <Car className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">Kendaraan</span>
          </Link>
          <Link to="/ga/building" className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-100 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <Building2 className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">Gedung & Sewa</span>
          </Link>
          <Link to="/ga/equipment" className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-100 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <ScanLine className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">Equipment</span>
          </Link>
          <Link to="/ga/maintenance" className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-100 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <Wrench className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">Maintenance</span>
          </Link>
          <Link to="/ga/material-requests" className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-100 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <ClipboardList className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">Permintaan Barang</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default EamDashboard;
