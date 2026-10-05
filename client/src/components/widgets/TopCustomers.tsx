import { useQuery } from '@tanstack/react-query';
import { Trophy, Users } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface TopCustomer {
  partyId: string;
  partyName: string;
  total: number;
  rank: number;
}

export default function TopCustomers() {
  const { data, isLoading, isError, refetch } = useQuery<TopCustomer[]>({
    queryKey: ['dashboard-top-customers'],
    queryFn: async () => (await api.get('/dashboard/top-customers')).data,
  });

  return (
    <WidgetCard
      title="Pelanggan Teratas"
      description="Berdasarkan total penjualan"
      icon={Users}
      href="/parties"
      hrefLabel="Pelanggan"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={Trophy}
      emptyText="Belum ada data penjualan"
    >
      <ol className="space-y-2.5">
        {(data ?? []).map((c) => (
          <li key={c.partyId} className="flex items-center gap-3">
            <span className="num w-6 text-center text-sm font-semibold text-muted-foreground">{c.rank}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.partyName}</span>
            <span className="num text-xs font-semibold text-foreground">{formatRupiah(c.total)}</span>
          </li>
        ))}
      </ol>
    </WidgetCard>
  );
}
