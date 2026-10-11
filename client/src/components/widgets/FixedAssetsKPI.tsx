import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });

  if (isError) {
    return <WidgetCard title={t('fixedAssetsKpi.title')} isError onRetry={() => void refetch()} minHeight={96} />;
  }

  const s = data?.summary;
  const money = (v?: number) => ({ value: formatRupiah(v, { compact: true }), valueTitle: formatRupiah(v) });
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard label={t('financialRatios.totalAssets')} value={formatNumber(s?.count)} icon={Layers} hint={t('fixedAssetsKpi.countHint')} loading={isLoading} href="/fixed-assets" />
      <StatCard label={t('fixedAssetsKpi.cost')} {...money(s?.totalCost)} icon={Building2} hint={t('fixedAssetsKpi.costHint')} loading={isLoading} />
      <StatCard
        label={t('fixedAssetsKpi.accumulated')}
        {...money(s?.totalAccumulated)}
        icon={TrendingDown}
        hint={s ? (s.depreciationYTD > 0 ? t('fixedAssetsKpi.ytd', { value: formatRupiah(s.depreciationYTD, { compact: true }) }) : t('fixedAssetsKpi.noYtd')) : undefined}
        loading={isLoading}
      />
      <StatCard
        label={t('fixedAssetsKpi.netBookValue')}
        {...money(s?.totalBookValue)}
        icon={Wallet}
        hint={s ? (s.totalCost > 0 ? t('fixedAssetsKpi.ofCost', { pct: formatNumber((s.totalBookValue / s.totalCost) * 100, { decimals: 1 }) }) : '—') : undefined}
        loading={isLoading}
      />
    </div>
  );
}
