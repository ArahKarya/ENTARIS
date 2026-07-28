import React from 'react';
import { ArrowUpRight, ArrowDownRight, BarChart3 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface RecentActivitiesProps {
  data: any[] | null;
}

const RecentActivities: React.FC<RecentActivitiesProps> = ({ data }) => (
  <div
    className="border rounded-xl p-5 flex flex-col"
    style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
  >
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        Aktivitas Terakhir
      </h2>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        Live
      </span>
    </div>

    <div className="flex-1 space-y-3 overflow-y-auto">
      {data?.length ? (
        data.map((a: any) => (
          <div key={a.id} className="flex items-center gap-3">
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                a.paymentType === 'Receive' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
              )}
            >
              {a.paymentType === 'Receive' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                {a.paymentNumber}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {new Date(a.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
              </p>
            </div>
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                a.paymentType === 'Receive' ? 'text-green-600' : 'text-red-500'
              )}
            >
              {a.paymentType === 'Receive' ? '+' : '-'}
              {new Intl.NumberFormat('id-ID').format(a.amount)}
            </span>
          </div>
        ))
      ) : (
        <div className="flex flex-col items-center justify-center h-full py-8 gap-3" style={{ color: 'var(--color-text-muted)' }}>
          <BarChart3 size={36} />
          <p className="text-xs">Belum ada aktivitas</p>
        </div>
      )}
    </div>

    <a
      href="/payments"
      className="block mt-4 text-xs font-medium transition-colors text-center pt-3 border-t hover:text-blue-600"
      style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
    >
      Lihat semua &rarr;
    </a>
  </div>
);

export default RecentActivities;
