import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { PackageX, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const StockAlert: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stock-alerts'],
    queryFn: async () => {
      const r = await api.get('/dashboard/stock-alerts');
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
          Stok Alert
        </h2>
        <PackageX size={16} className="text-orange-500" />
      </div>

      {isLoading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <CheckCircle2 size={28} className="mx-auto mb-2 text-green-500 opacity-50" />
          <p className="text-xs">Semua stok aman</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-64 overflow-y-auto">
          {data.map((item: any) => (
            <div
              key={item.id}
              className="flex items-center gap-3 py-2 border-b last:border-b-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {item.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Stok: {item.currentStock} / Min: {item.minimumStock} {item.unit}
                </p>
              </div>
              <span
                className={cn(
                  'badge rounded-full text-xs font-semibold',
                  item.status === 'Habis' ? 'badge-red' : 'badge-yellow'
                )}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StockAlert;
