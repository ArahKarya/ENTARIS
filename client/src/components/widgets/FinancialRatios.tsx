import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Scale, TriangleAlert } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface RatioData {
  currentRatio: number;
  debtToEquity: number;
  debtToAsset: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export default function FinancialRatios() {
  const { data, isLoading, isError, refetch } = useQuery<RatioData>({
    queryKey: ['financial-ratios'],
    queryFn: async () => (await api.get('/dashboard/financial-ratios')).data,
  });

  const ratios = data
    ? [
        { label: 'Current Ratio', value: data.currentRatio, good: data.currentRatio >= 1.5 },
        { label: 'Debt to Equity', value: data.debtToEquity, good: data.debtToEquity <= 2 },
        { label: 'Debt to Asset', value: data.debtToAsset, good: data.debtToAsset <= 0.5 },
      ]
    : [];

  return (
    <WidgetCard
      title="Rasio Keuangan"
      icon={Scale}
      href="/reports/balance-sheet"
      hrefLabel="Neraca"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      minHeight={230}
    >
      {data && (
        <>
          <ul className="space-y-2">
            {ratios.map((r) => {
              const Icon = r.good ? CheckCircle2 : TriangleAlert;
              return (
                <li key={r.label} className="flex items-center justify-between rounded-md bg-muted/50 p-3">
                  <span className="text-xs font-medium text-muted-foreground">{r.label}</span>
                  <span className={cn('flex items-center gap-1.5 num text-sm font-semibold', r.good ? 'text-success-text' : 'text-warning-text')}>
                    <Icon className="size-4" aria-hidden />
                    {r.value}x
                    <span className="sr-only">{r.good ? ', sehat' : ', perlu perhatian'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            {[
              ['Total Aset', data.totalAssets],
              ['Liabilitas', data.totalLiabilities],
              ['Ekuitas', data.totalEquity],
            ].map(([k, v]) => (
              <div key={k as string} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="num mt-0.5 truncate text-xs font-semibold text-foreground" title={formatRupiah(v as number)}>
                  {formatRupiah(v as number, { compact: true })}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </WidgetCard>
  );
}
