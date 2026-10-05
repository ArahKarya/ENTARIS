import { useQuery } from '@tanstack/react-query';
import { Warehouse } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { MiniTable } from '../dashboard-kit/MiniTable';

interface TopItem {
  id: string;
  code: string;
  name: string;
  currentStock: number;
  minimumStock: number;
  averageCost: number;
  stockValue: number;
  unit: string;
}

type Level = { label: string; variant: 'success' | 'warning' | 'danger' };

function stockLevel(current: number, min: number): Level | null {
  if (min <= 0) return null;
  if (current > min * 2) return { label: 'Aman', variant: 'success' };
  if (current > min) return { label: 'Menipis', variant: 'warning' };
  return { label: 'Kritis', variant: 'danger' };
}

export default function TopItemsByStock() {
  const { data, isLoading, isError, refetch } = useQuery<TopItem[]>({
    queryKey: ['warehouse-top-items'],
    queryFn: async () => (await api.get('/inventory/dashboard/top-items')).data,
  });

  return (
    <WidgetCard
      title={`Daftar Stok Item${data ? ` (${data.length})` : ''}`}
      icon={Warehouse}
      href="/inventory"
      hrefLabel="Stok"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={Warehouse}
      emptyText="Belum ada data item"
      minHeight={260}
    >
      <MiniTable
        caption="Daftar stok item"
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: 'code', label: 'Kode', hideOnMobile: true },
          { key: 'name', label: 'Nama' },
          { key: 'stock', label: 'Stok', numeric: true },
          { key: 'value', label: 'Nilai', numeric: true, hideOnMobile: true },
          { key: 'min', label: 'Min', numeric: true, hideOnMobile: true },
          { key: 'status', label: 'Status' },
        ]}
        cell={(r, k) => {
          const cur = Number(r.currentStock);
          const min = Number(r.minimumStock);
          switch (k) {
            case 'code':
              return <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{r.code}</span>;
            case 'name':
              return <span className="font-medium">{r.name}</span>;
            case 'stock':
              return formatNumber(cur);
            case 'value':
              return formatRupiah(r.stockValue);
            case 'min':
              return <span className="text-muted-foreground">{formatNumber(min)}</span>;
            default: {
              const lv = stockLevel(cur, min);
              return lv ? <Badge variant={lv.variant}>{lv.label}</Badge> : <span className="text-muted-foreground">-</span>;
            }
          }
        }}
      />
    </WidgetCard>
  );
}
