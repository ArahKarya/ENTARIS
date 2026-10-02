import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import api from '../../lib/api';
import { formatRupiah } from '../../lib/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentMovement {
  id: string;
  date: string;
  item: { name: string; unit: string; code: string };
  movementType: 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut';
  quantity: number;
  totalValue: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (val: number | string, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const movementBadge: Record<string, { label: string; className: string }> = {
  In: { label: 'Masuk', className: 'badge badge-green' },
  Out: { label: 'Keluar', className: 'badge badge-red' },
  AdjustmentIn: { label: 'Adj+', className: 'badge badge-blue' },
  AdjustmentOut: { label: 'Adj-', className: 'badge badge-orange' },
};

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function RecentMovements() {
  const { data, isLoading } = useQuery<RecentMovement[]>({
    queryKey: ['warehouse-recent-movements'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/recent-movements');
      return r.data;
    },
  });

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Gerakan Stok Terkini
        </h2>
      </div>
      {isLoading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">Belum ada gerakan stok</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className="text-left font-medium pb-2">Tanggal</th>
                <th className="text-left font-medium pb-2">Item</th>
                <th className="text-center font-medium pb-2">Tipe</th>
                <th className="text-right font-medium pb-2">Qty</th>
                <th className="text-right font-medium pb-2">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {data.map((mov) => {
                const badge = movementBadge[mov.movementType] ?? {
                  label: mov.movementType,
                  className: 'badge',
                };
                return (
                  <tr
                    key={mov.id}
                    className="border-t"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="py-2 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                      {format(new Date(mov.date), 'dd MMM', { locale: idLocale })}
                    </td>
                    <td className="py-2 font-medium truncate max-w-[120px]" style={{ color: 'var(--color-text-primary)' }}>
                      {mov.item?.name ?? '-'}
                    </td>
                    <td className="py-2 text-center">
                      <span className={badge.className}>{badge.label}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {formatNumber(mov.quantity)}
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                      {mov.totalValue != null ? formatRupiah(Number(mov.totalValue)) : '\u2014'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
