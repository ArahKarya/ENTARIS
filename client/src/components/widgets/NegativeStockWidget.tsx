import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, PackageX } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ReportNotice } from '../report-kit/ReportNotice';

interface NegativeStockItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  currentStock: number;
  negativeWarehouses: Array<{ warehouseCode: string; warehouseName: string; currentStock: string | number }>;
  lastMovementAt: string | null;
}

function daysAgo(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'hari ini';
  if (days === 1) return '1 hari lalu';
  return `${days} hari lalu`;
}

export default function NegativeStockWidget() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-negative-stock'],
    queryFn: async () => {
      const res = await api.get('/dashboard/negative-stock');
      return res.data as NegativeStockItem[];
    },
    refetchInterval: 60_000,
  });

  const items = data ?? [];
  const count = items.length;

  return (
    <WidgetCard
      title="Stok Minus Aktif"
      icon={PackageX}
      href="/inventory"
      hrefLabel="Stok"
      actions={data ? <Badge variant={count > 0 ? 'danger' : 'success'}>{count} item</Badge> : undefined}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && count === 0}
      emptyIcon={CheckCircle2}
      emptyText="Tidak ada stok minus"
    >
      <ReportNotice tone="warning" className="mb-3">
        Bypass Admin aktif. Pastikan produksi/penerimaan segera diinput supaya stok kembali positif.
      </ReportNotice>
      <ScrollRegion label="Daftar stok minus" className="max-h-72 overflow-y-auto">
<ul className="space-y-1.5">
        {items.slice(0, 10).map((it) => (
          <li key={it.id} className="rounded-md border border-border px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{it.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{it.code}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="num font-medium text-danger-text">{formatNumber(it.currentStock, { maxDecimals: 3 })} {it.unit}</p>
                <p className="text-[11px] text-muted-foreground">{daysAgo(it.lastMovementAt)}</p>
              </div>
            </div>
            {it.negativeWarehouses.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {it.negativeWarehouses.map((w, i) => (
                  <Badge key={i} variant="danger" className="num font-normal">
                    {w.warehouseCode}: {formatNumber(Number(w.currentStock), { maxDecimals: 3 })}
                  </Badge>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
</ScrollRegion>
      {count > 10 && <p className="mt-2 text-xs text-muted-foreground">+ {count - 10} item lain</p>}
    </WidgetCard>
  );
}
