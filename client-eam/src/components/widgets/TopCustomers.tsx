import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Users, Loader2, Trophy } from 'lucide-react';
import { formatRupiah } from '../../lib/formatters';

const TopCustomers: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-top-customers'],
    queryFn: async () => {
      const r = await api.get('/dashboard/top-customers');
      return r.data;
    },
  });

  const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Pelanggan Teratas
        </h2>
        <Users size={16} style={{ color: 'var(--color-text-muted)' }} />
      </div>

      {isLoading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Trophy size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Belum ada data penjualan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((c: any) => (
            <div key={c.partyId} className="flex items-center gap-3">
              <span
                className={`text-sm font-bold w-6 text-center ${rankColors[c.rank - 1] || ''}`}
                style={c.rank > 3 ? { color: 'var(--color-text-muted)' } : undefined}
              >
                {c.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {c.partyName}
                </p>
              </div>
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                {formatRupiah(c.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TopCustomers;
