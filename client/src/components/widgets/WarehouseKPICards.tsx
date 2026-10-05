import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Banknote, CheckCircle, Package } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { StatCard } from '../shared/stat-card';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface DashboardMetrics {
  totalItems: number;
  activeItems: number;
  lowStockItems: number;
  movementsThisMonth: number;
  inventoryValue: number;
}

export default function WarehouseKPICards() {
  const { data: m, isLoading, isError, refetch } = useQuery<DashboardMetrics>({
    queryKey: ['warehouse-metrics'],
    queryFn: async () => (await api.get('/inventory/dashboard/metrics')).data,
  });

  if (isError) {
    return <WidgetCard title="Ringkasan Stok" isError onRetry={() => void refetch()} minHeight={96} />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      <StatCard label="Total Item" value={formatNumber(m?.totalItems)} icon={Package} loading={isLoading} href="/inventory" />
      <StatCard label="Item Aktif" value={formatNumber(m?.activeItems)} icon={CheckCircle} loading={isLoading} />
      <StatCard
        label="Stok Menipis"
        value={formatNumber(m?.lowStockItems)}
        icon={AlertTriangle}
        loading={isLoading}
        hint={m && m.lowStockItems > 0 ? 'Perlu restock' : undefined}
      />
      <StatCard label="Gerakan Bulan Ini" value={formatNumber(m?.movementsThisMonth)} icon={ArrowLeftRight} loading={isLoading} />
      <StatCard
        label="Nilai Persediaan"
        value={formatRupiah(m?.inventoryValue, { compact: true })}
        valueTitle={formatRupiah(m?.inventoryValue)}
        icon={Banknote}
        loading={isLoading}
      />
    </div>
  );
}
