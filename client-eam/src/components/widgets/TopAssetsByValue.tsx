import { useQuery } from '@tanstack/react-query';
import { Trophy, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah, formatDate } from '../../lib/formatters';

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

const CATEGORY_BADGE: Record<string, string> = {
  Tanah: 'badge-green',
  Bangunan: 'badge-blue',
  Peralatan: 'badge-orange',
  Mesin: 'badge-purple',
};

export default function TopAssetsByValue() {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });

  const rows = data?.topAssets ?? [];

  return (
    <div className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Top 10 Aset (Nilai Buku)
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Aset dengan nilai buku tertinggi
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
          <Trophy size={16} className="text-purple-600" />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Trophy size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Belum ada aset</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                <th className="text-left py-2 px-2 font-medium text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>
                  Kode
                </th>
                <th className="text-left py-2 px-2 font-medium text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>
                  Nama
                </th>
                <th className="text-left py-2 px-2 font-medium text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>
                  Kategori
                </th>
                <th className="text-right py-2 px-2 font-medium text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>
                  Harga Beli
                </th>
                <th className="text-right py-2 px-2 font-medium text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>
                  Nilai Buku
                </th>
                <th className="text-right py-2 px-2 font-medium text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>
                  Penyusutan
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                  style={{ borderColor: 'var(--color-border)' }}>
                  <td className="py-2 px-2 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {a.assetNumber}
                  </td>
                  <td className="py-2 px-2 max-w-[180px]">
                    <p className="truncate font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {a.name}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      Acq: {formatDate(a.acquisitionDate)}
                    </p>
                  </td>
                  <td className="py-2 px-2">
                    <span className={`badge ${CATEGORY_BADGE[a.category] ?? 'badge-gray'} text-[10px]`}>
                      {a.category}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    {formatRupiah(a.acquisitionCost)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}>
                    {formatRupiah(a.bookValue)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-12 h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${Math.min(100, a.accumPct)}%` }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums w-9 text-right"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {a.accumPct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
