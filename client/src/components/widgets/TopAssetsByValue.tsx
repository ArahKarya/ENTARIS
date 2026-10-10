import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import api from '../../lib/api';
import { formatDate, formatRupiah } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { MiniTable } from '../dashboard-kit/MiniTable';

interface TopAssetRow {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  bookValue: number;
  accumulatedDepreciation: number;
  accumPct: number;
}

interface ApiResponse {
  topAssets: TopAssetRow[];
}

export default function TopAssetsByValue() {
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });
  const rows = data?.topAssets ?? [];

  return (
    <WidgetCard
      title="Top 10 Aset (Nilai Buku)"
      description="Aset dengan nilai buku tertinggi"
      icon={Trophy}
      href="/fixed-assets"
      hrefLabel="Aset tetap"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={Trophy}
      emptyText="Belum ada aset"
      minHeight={200}
    >
      <MiniTable
        caption="Sepuluh aset tetap dengan nilai buku tertinggi"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: 'code', label: 'Kode', hideOnMobile: true },
          { key: 'name', label: 'Nama' },
          { key: 'cat', label: 'Kategori', hideOnMobile: true },
          { key: 'cost', label: 'Harga Beli', numeric: true, hideOnMobile: true },
          { key: 'book', label: 'Nilai Buku', numeric: true },
          { key: 'dep', label: 'Penyusutan', numeric: true },
        ]}
        cell={(a, k) => {
          switch (k) {
            case 'code':
              return <span className="font-mono text-muted-foreground">{a.assetNumber}</span>;
            case 'name':
              return (
                <div className="max-w-[180px]">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground">Perolehan {formatDate(a.acquisitionDate)}</p>
                </div>
              );
            case 'cat':
              return <Badge>{a.category}</Badge>;
            case 'cost':
              return <span className="text-muted-foreground">{formatRupiah(a.acquisitionCost)}</span>;
            case 'book':
              return <span className="font-semibold">{formatRupiah(a.bookValue)}</span>;
            default:
              return (
                <div className="flex items-center justify-end gap-1.5">
                  <div className="h-1.5 w-12 overflow-hidden rounded-sm bg-muted" aria-hidden>
                    <div className="h-full bg-chart-4" style={{ width: `${Math.min(100, a.accumPct)}%` }} />
                  </div>
                  <span className="w-9 text-right text-[11px] text-muted-foreground">{a.accumPct}%</span>
                </div>
              );
          }
        }}
      />
    </WidgetCard>
  );
}
