import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { Truck, AlertTriangle, ChevronRight } from 'lucide-react';
import { formatDate } from '../../lib/formatters';

interface PendingDO {
  id: string;
  doNumber: string;
  date: string;
  customer: { id: string; name: string } | null;
  itemCount: number;
  totalQty: number;
  unit: string;
  ageDays: number;
}

const AGE_WARNING = 5;
const AGE_CRITICAL = 10;

export default function PendingDOWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-pending-do'],
    queryFn: async () => {
      const res = await api.get('/dashboard/pending-do');
      return res.data as PendingDO[];
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
  const overdue = items.filter((it) => it.ageDays >= AGE_WARNING).length;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded-lg">
            <Truck size={16} className="text-blue-600" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Surat Jalan Belum di-Invoice</h3>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
          count === 0 ? 'bg-green-100 text-green-700'
          : overdue > 0 ? 'bg-red-100 text-red-700'
          : 'bg-amber-100 text-amber-700'
        }`}>
          {count} DO
        </span>
      </div>

      {count === 0 ? (
        <p className="text-xs text-muted-foreground">Semua DO sudah di-invoice. Bersih.</p>
      ) : (
        <>
          {overdue > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                <strong>{overdue} DO</strong> sudah ≥ {AGE_WARNING} hari belum di-invoice. Segera tagih ke pelanggan.
              </p>
            </div>
          )}
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {items.slice(0, 10).map((it) => {
              const ageColor =
                it.ageDays >= AGE_CRITICAL ? 'text-red-600'
                : it.ageDays >= AGE_WARNING ? 'text-amber-600'
                : 'text-muted-foreground';
              return (
                <li key={it.id} className="border border-border rounded-lg px-3 py-2 text-xs hover:bg-accent/40 transition-colors">
                  <Link to="/delivery-orders" className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">{it.doNumber}</span>
                        <span className="text-muted-foreground">{formatDate(it.date)}</span>
                      </div>
                      <p className="font-medium text-foreground truncate mt-0.5">{it.customer?.name ?? '—'}</p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        {it.totalQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {it.unit} • {it.itemCount} item
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-semibold ${ageColor}`}>
                        {it.ageDays === 0 ? 'hari ini' : `${it.ageDays} hari`}
                      </p>
                      <ChevronRight size={12} className="text-muted-foreground inline" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {count > 10 && (
            <p className="text-xs text-muted-foreground mt-2">+ {count - 10} DO lain</p>
          )}
        </>
      )}
    </div>
  );
}
