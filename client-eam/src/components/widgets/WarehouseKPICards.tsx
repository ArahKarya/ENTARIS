import { useQuery } from '@tanstack/react-query';
import { Package, CheckCircle, AlertTriangle, ArrowLeftRight, Loader2, Banknote } from 'lucide-react';
import api from '../../lib/api';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardMetrics {
  totalItems: number;
  activeItems: number;
  lowStockItems: number;
  movementsThisMonth: number;
  inventoryValue: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (val: number | string, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const formatRupiahCompact = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} T`;
  }
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  }
  if (abs >= 10_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Jt`;
  }
  return formatRupiah(value);
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  bgClass: string;
  iconClass: string;
  loading: boolean;
  format?: 'number' | 'rupiah';
}

function KpiCard({ title, value, icon: Icon, bgClass, iconClass, loading, format = 'number' }: KpiCardProps) {
  const isRupiah = format === 'rupiah';
  const displayValue = isRupiah ? formatRupiahCompact(value) : formatNumber(value);
  const titleAttr = isRupiah ? formatRupiah(value) : undefined;
  return (
    <div
      className="border rounded-xl p-5 min-w-0"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4 gap-2">
        <span
          className="text-xs font-medium uppercase tracking-wide truncate"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {title}
        </span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', bgClass)}>
          <Icon size={16} className={iconClass} />
        </div>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      ) : (
        <p
          className="text-xl xl:text-2xl font-semibold tabular-nums truncate leading-tight"
          style={{ color: 'var(--color-text-primary)' }}
          title={titleAttr}
        >
          {displayValue}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function WarehouseKPICards() {
  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['warehouse-metrics'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/metrics');
      return r.data;
    },
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard
        title="Total Item"
        value={metrics?.totalItems ?? 0}
        icon={Package}
        bgClass="bg-blue-50 dark:bg-blue-900/30"
        iconClass="text-blue-600"
        loading={isLoading}
      />
      <KpiCard
        title="Item Aktif"
        value={metrics?.activeItems ?? 0}
        icon={CheckCircle}
        bgClass="bg-green-50 dark:bg-green-900/30"
        iconClass="text-green-600"
        loading={isLoading}
      />
      <KpiCard
        title="Stok Menipis"
        value={metrics?.lowStockItems ?? 0}
        icon={AlertTriangle}
        bgClass="bg-red-50 dark:bg-red-900/30"
        iconClass="text-red-600"
        loading={isLoading}
      />
      <KpiCard
        title="Gerakan Bulan Ini"
        value={metrics?.movementsThisMonth ?? 0}
        icon={ArrowLeftRight}
        bgClass="bg-purple-50 dark:bg-purple-900/30"
        iconClass="text-purple-600"
        loading={isLoading}
      />
      <KpiCard
        title="Nilai Persediaan"
        value={metrics?.inventoryValue ?? 0}
        icon={Banknote}
        bgClass="bg-emerald-50 dark:bg-emerald-900/30"
        iconClass="text-emerald-600"
        loading={isLoading}
        format="rupiah"
      />
    </div>
  );
}
