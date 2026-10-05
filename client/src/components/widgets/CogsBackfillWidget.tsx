import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Receipt } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface BackfillBreakdown {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  qtyPending: number;
  estimatedValue: number;
}

interface BackfillSummary {
  pendingCount: number;
  totalPendingValue: number;
  breakdown: BackfillBreakdown[];
}

export default function CogsBackfillWidget() {
  const { data, isLoading, isError, refetch } = useQuery<BackfillSummary>({
    queryKey: ['cogs-backfill-summary'],
    queryFn: async () => (await api.get('/cogs-backfill/summary')).data,
    refetchInterval: 60_000,
  });

  const empty = !isLoading && !isError && (!data || data.pendingCount === 0);

  return (
    <WidgetCard
      title="COGS Pending Settle"
      description="Penjualan saat stok minus, otomatis settle saat barang masuk"
      icon={Receipt}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={empty}
      emptyIcon={CheckCircle2}
      emptyText="Tidak ada COGS pending. Semua penjualan tercover stok."
      minHeight={110}
    >
      {data && (
        <>
          <dl className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Item Pending</dt>
              <dd className="num text-xl font-semibold text-foreground">{data.pendingCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Estimasi Nilai</dt>
              <dd className="num text-xl font-semibold text-warning-text" title={formatRupiah(data.totalPendingValue)}>
                {formatRupiah(data.totalPendingValue, { compact: true })}
              </dd>
            </div>
          </dl>
          <ScrollRegion label="Rincian COGS pending per item" className="max-h-48 overflow-y-auto">
<ul className="divide-y divide-border">
            {data.breakdown.slice(0, 8).map((b) => (
              <li key={b.itemId} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{b.name}</p>
                  <p className="num text-muted-foreground">{formatNumber(b.qtyPending, { maxDecimals: 3 })} {b.unit}</p>
                </div>
                <span className="num text-warning-text">{formatRupiah(b.estimatedValue, { compact: true })}</span>
              </li>
            ))}
          </ul>
</ScrollRegion>
        </>
      )}
    </WidgetCard>
  );
}
