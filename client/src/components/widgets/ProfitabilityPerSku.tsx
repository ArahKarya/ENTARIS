import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Calculator, TrendingDown, TrendingUp } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { computePresetRange } from '../dashboardPeriod';
import { MiniTable } from '../dashboard-kit/MiniTable';

interface SkuRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  totalQty: number;
  totalRevenue: number;
  materialCogs: number;
  loadedCogs: number;
  materialMargin: number;
  loadedMargin: number;
  materialMarginPct: number;
  loadedMarginPct: number;
  coveragePct: number;
}

interface ApiResponse {
  items: SkuRow[];
  summary: { totalRevenue: number; materialMarginPct: number; loadedMarginPct: number };
}

interface Props {
  startDate: string;
  endDate: string;
}

const fmtPct = (n: number) => `${formatNumber(n, { decimals: 1 })}%`;
const marginTone = (p: number) => (p >= 20 ? 'text-success-text' : p >= 0 ? 'text-warning-text' : 'text-danger-text');

export default function ProfitabilityPerSku({ startDate, endDate }: Props) {
  const { t } = useTranslation('dashboard');
  const primary = useQuery<ApiResponse>({
    queryKey: ['dashboard-profitability-per-sku', startDate, endDate],
    queryFn: async () => (await api.get('/reports/profitability-per-sku', { params: { startDate, endDate } })).data,
  });
  // No sales in the selected period: fall back to the last 12 months (clearly labelled).
  const periodEmpty = !!primary.data && primary.data.items.length === 0;
  const fallbackRange = computePresetRange('last12Months');
  const fallback = useQuery<ApiResponse>({
    queryKey: ['dashboard-profitability-per-sku', fallbackRange.startDate, fallbackRange.endDate],
    queryFn: async () => (await api.get('/reports/profitability-per-sku', { params: fallbackRange })).data,
    enabled: periodEmpty,
  });
  const usingFallback = periodEmpty && (fallback.data?.items.length ?? 0) > 0;
  const { data, isLoading, isError, refetch } = usingFallback || (periodEmpty && fallback.isLoading) ? { ...fallback, isLoading: primary.isLoading || fallback.isLoading } : primary;
  const rows = (data?.items ?? []).slice(0, 10);

  return (
    <WidgetCard
      title={t('profitabilityPerSku.title')}
      description={
        usingFallback
          ? t('profitabilityPerSku.fallbackDescription')
          : t('profitabilityPerSku.description')
      }
      icon={Calculator}
      href="/reports/profitability-per-sku"
      hrefLabel={t('profitabilityPerSku.fullReport')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0 && !fallback.isLoading}
      emptyIcon={Calculator}
      emptyText={t('profitabilityPerSku.empty')}
      minHeight={240}
    >
      {data && (
        <>
          <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
            {[
              [t('profitabilityPerSku.revenue'), formatRupiah(data.summary.totalRevenue, { compact: true }), 'text-foreground'],
              [t('profitabilityPerSku.materialMargin'), fmtPct(data.summary.materialMarginPct), marginTone(data.summary.materialMarginPct)],
              [t('profitabilityPerSku.loadedMargin'), fmtPct(data.summary.loadedMarginPct), marginTone(data.summary.loadedMarginPct)],
            ].map(([k, v, tone]) => (
              <div key={k} className="rounded-md border border-border px-2 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className={cn('num text-sm font-semibold', tone)}>{v}</dd>
              </div>
            ))}
          </dl>
          <MiniTable
            caption={t('profitabilityPerSku.title')}
            maxHeightClass="max-h-96"
            rows={rows}
            rowKey={(r) => r.itemId}
            columns={[
              { key: 'name', label: t('profitabilityPerSku.product') },
              { key: 'rev', label: t('profitabilityPerSku.revenue'), numeric: true, hideOnMobile: true },
              { key: 'mat', label: t('profitabilityPerSku.matPct'), numeric: true },
              { key: 'loaded', label: t('profitabilityPerSku.loadedPct'), numeric: true },
              { key: 'cov', label: t('profitabilityPerSku.coverage'), numeric: true, hideOnMobile: true },
            ]}
            cell={(r, k) => {
              switch (k) {
                case 'name':
                  return (
                    <div className="max-w-[180px]">
                      <p className="truncate font-medium">{r.itemName}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{r.itemCode}</p>
                    </div>
                  );
                case 'rev':
                  return formatRupiah(r.totalRevenue);
                case 'mat': {
                  const Icon = r.materialMarginPct >= 0 ? TrendingUp : TrendingDown;
                  return (
                    <span className={cn('inline-flex items-center gap-0.5', marginTone(r.materialMarginPct))}>
                      <Icon className="size-3" aria-hidden />
                      {fmtPct(r.materialMarginPct)}
                    </span>
                  );
                }
                case 'loaded':
                  return <span className={marginTone(r.loadedMarginPct)}>{fmtPct(r.loadedMarginPct)}</span>;
                default:
                  return <Badge variant={r.coveragePct === 100 ? 'success' : r.coveragePct >= 50 ? 'warning' : 'neutral'}>{r.coveragePct}%</Badge>;
              }
            }}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            <Trans t={t} i18nKey="profitabilityPerSku.coverageNote" components={{ b: <span className="font-semibold" /> }} />
          </p>
        </>
      )}
    </WidgetCard>
  );
}
