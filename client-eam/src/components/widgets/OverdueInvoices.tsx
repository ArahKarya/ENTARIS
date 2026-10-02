import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { AlertTriangle, Loader2, FileWarning } from 'lucide-react';
import { formatRupiah } from '../../lib/formatters';
import { cn } from '../../lib/utils';

const OverdueInvoices: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-overdue'],
    queryFn: async () => {
      const r = await api.get('/dashboard/overdue');
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
          Invoice Jatuh Tempo
        </h2>
        <AlertTriangle size={16} className="text-orange-500" />
      </div>

      {isLoading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <FileWarning size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Tidak ada invoice jatuh tempo</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-64 overflow-y-auto">
          {data.map((inv: any, i: number) => (
            <div
              key={`${inv.type}-${inv.invoiceNumber}-${i}`}
              className="flex items-center gap-3 py-2 border-b last:border-b-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {inv.invoiceNumber}
                  </span>
                  <span
                    className={cn(
                      'badge text-xs',
                      inv.type === 'sales' ? 'badge-blue' : 'badge-purple'
                    )}
                  >
                    {inv.type === 'sales' ? 'AR' : 'AP'}
                  </span>
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {inv.partyName}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-semibold tabular-nums text-red-600">
                  {formatRupiah(inv.amount)}
                </p>
                <p className="text-xs text-orange-600 font-medium">
                  {inv.daysOverdue} hari
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OverdueInvoices;
