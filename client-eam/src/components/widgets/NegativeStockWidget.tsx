import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { AlertTriangle, PackageX } from 'lucide-react';

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
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return 'hari ini';
  if (days === 1) return '1 hari lalu';
  return `${days} hari lalu`;
}

export default function NegativeStockWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-negative-stock'],
    queryFn: async () => {
      const res = await api.get('/dashboard/negative-stock');
      return res.data as NegativeStockItem[];
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="card p-4">
        <p className="text-sm text-muted-foreground">Memuat...</p>
      </div>
    );
  }

  const items = data ?? [];
  const count = items.length;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-50 rounded-lg">
            <PackageX size={16} className="text-red-600" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Stok Minus Aktif</h3>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${count > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {count} item
        </span>
      </div>

      {count === 0 ? (
        <p className="text-xs text-muted-foreground">Tidak ada stok minus. Sistem bersih.</p>
      ) : (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              Bypass Admin aktif. Pastikan produksi/penerimaan segera diinput supaya stok kembali positif.
            </p>
          </div>
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {items.slice(0, 10).map((it) => (
              <li key={it.id} className="border border-border rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{it.name}</p>
                    <p className="text-muted-foreground font-mono text-[10px]">{it.code}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono tabular-nums text-red-600 font-medium">
                      {it.currentStock.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {it.unit}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{daysAgo(it.lastMovementAt)}</p>
                  </div>
                </div>
                {it.negativeWarehouses.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {it.negativeWarehouses.map((w, i) => (
                      <span key={i} className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-1.5 py-0.5 rounded">
                        {w.warehouseCode}: {Number(w.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {count > 10 && (
            <p className="text-xs text-muted-foreground mt-2">+ {count - 10} item lain</p>
          )}
        </>
      )}
    </div>
  );
}
