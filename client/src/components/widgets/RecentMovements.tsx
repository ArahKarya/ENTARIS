import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import api from '../../lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { MiniTable } from '../dashboard-kit/MiniTable';

interface RecentMovement {
  id: string;
  date: string;
  item: { name: string; unit: string; code: string };
  movementType: 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut';
  quantity: number;
  totalValue: number | null;
}

const MOVEMENT: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  In: { label: 'Masuk', variant: 'success' },
  Out: { label: 'Keluar', variant: 'danger' },
  AdjustmentIn: { label: 'Adj+', variant: 'info' },
  AdjustmentOut: { label: 'Adj-', variant: 'warning' },
};

export default function RecentMovements() {
  const { data, isLoading, isError, refetch } = useQuery<RecentMovement[]>({
    queryKey: ['warehouse-recent-movements'],
    queryFn: async () => (await api.get('/inventory/dashboard/recent-movements')).data,
  });

  return (
    <WidgetCard
      title="Gerakan Stok Terkini"
      icon={ArrowLeftRight}
      href="/inventory"
      hrefLabel="Stok"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={ArrowLeftRight}
      emptyText="Belum ada gerakan stok"
      minHeight={260}
    >
      <MiniTable
        caption="Gerakan stok terkini"
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: 'date', label: 'Tanggal' },
          { key: 'item', label: 'Item' },
          { key: 'type', label: 'Tipe' },
          { key: 'qty', label: 'Qty', numeric: true },
          { key: 'value', label: 'Nilai', numeric: true, hideOnMobile: true },
        ]}
        cell={(r, k) => {
          const mv = MOVEMENT[r.movementType] ?? { label: r.movementType, variant: 'neutral' as const };
          switch (k) {
            case 'date':
              return <span className="whitespace-nowrap text-muted-foreground">{formatDate(r.date, 'short')}</span>;
            case 'item':
              return <span className="block max-w-[140px] truncate font-medium">{r.item?.name ?? '—'}</span>;
            case 'type':
              return <Badge variant={mv.variant}>{mv.label}</Badge>;
            case 'qty':
              return formatNumber(r.quantity);
            default:
              return <span className="text-muted-foreground">{r.totalValue != null ? formatRupiah(Number(r.totalValue)) : '—'}</span>;
          }
        }}
      />
    </WidgetCard>
  );
}
