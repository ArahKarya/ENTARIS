import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { formatRupiah, formatDate } from '../../lib/formatters';

interface UpcomingEntry {
  id: string;
  assetNumber: string;
  assetName: string;
  category: string;
  amount: number;
  dueDate: string;
}

interface DepreciationDueData {
  thisMonthAmount: number;
  thisMonthEntries: number;
  upcoming: UpcomingEntry[];
}

interface ApiResponse {
  depreciationDue: DepreciationDueData;
}

export default function DepreciationDue() {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });

  return (
    <div className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Penyusutan Mendatang
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Jadwal yang belum di-post
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
          <CalendarClock size={16} className="text-amber-600" />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : (
        <>
          {/* Banner bulan ini */}
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2.5 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                  Bulan ini
                </p>
                <p className="text-base font-bold tabular-nums text-amber-900 dark:text-amber-100">
                  {formatRupiah(data.depreciationDue.thisMonthAmount)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  {data.depreciationDue.thisMonthEntries} entry
                </p>
                <Link
                  to="/aset-tetap"
                  className="text-[11px] text-blue-600 hover:underline mt-0.5 inline-block"
                >
                  Buka Aset Tetap →
                </Link>
              </div>
            </div>
          </div>

          {/* List upcoming */}
          {data.depreciationDue.upcoming.length === 0 ? (
            <div className="py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
              <CheckCircle2 size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-xs">Semua jadwal sudah di-post</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.depreciationDue.upcoming.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 py-1.5 border-b last:border-b-0"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium"
                        style={{ color: 'var(--color-text-primary)' }}>
                        {e.assetNumber}
                      </span>
                      <span className="badge badge-gray text-[10px]">{e.category}</span>
                    </div>
                    <p className="text-xs truncate mt-0.5"
                      style={{ color: 'var(--color-text-muted)' }}>
                      {e.assetName}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold tabular-nums"
                      style={{ color: 'var(--color-text-primary)' }}>
                      {formatRupiah(e.amount)}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {formatDate(e.dueDate)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
