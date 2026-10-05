import { useQuery } from '@tanstack/react-query';
import { Building2, Layers, TrendingDown, Wallet } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { StatCard } from '../shared/stat-card';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface SummaryData {
  count: number;
  totalCost: number;
  totalAccumulated: number;
  totalBookValue: number;
  depreciationThisMonth: number;
  depreciationThisMonthEntries: number;
  depreciationYTD: number;
}

interface ApiResponse {
  summary: SummaryData;
}

export default function FixedAssetsKPI() {
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });

  if (isError) {
    return <WidgetCard title="Ringkasan Aset Tetap" isError onRetry={() => void refetch()} minHeight={96} />;
  }

  const s = data?.summary;
  const money = (v?: number) => ({ value: formatRupiah(v, { compact: true }), valueTitle: formatRupiah(v) });
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard label="Total Aset" value={formatNumber(s?.count)} icon={Layers} hint="entitas aset tetap aktif" loading={isLoading} href="/fixed-assets" />
      <StatCard label="Harga Perolehan" {...money(s?.totalCost)} icon={Building2} hint="akumulasi nilai beli" loading={isLoading} />
      <StatCard
        label="Akum. Penyusutan"
        {...money(s?.totalAccumulated)}
        icon={TrendingDown}
        hint={s ? (s.depreciationYTD > 0 ? `YTD ${formatRupiah(s.depreciationYTD, { compact: true })}` : 'belum ada posting YTD') : undefined}
        loading={isLoading}
      />
      <StatCard
        label="Nilai Buku Bersih"
        {...money(s?.totalBookValue)}
        icon={Wallet}
        hint={s ? (s.totalCost > 0 ? `${((s.totalBookValue / s.totalCost) * 100).toFixed(1)}% dari harga beli` : '-') : undefined}
        loading={isLoading}
      />
    </div>
  );
}
