import { useQuery } from '@tanstack/react-query';
import { PieChart as PieIcon, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import api from '../../lib/api';
import { formatRupiah } from '../../lib/formatters';

interface CategoryRow {
  category: string;
  count: number;
  totalCost: number;
  totalBookValue: number;
  pct: number;
}

interface ApiResponse {
  byCategory: CategoryRow[];
}

// Color per kategori — konsisten supaya legend & chart sinkron
const COLOR_MAP: Record<string, string> = {
  Tanah: '#10b981',     // emerald
  Bangunan: '#3b82f6',  // blue
  Peralatan: '#f59e0b', // amber
  Mesin: '#8b5cf6',     // purple
};
const FALLBACK_COLORS = ['#ef4444', '#14b8a6', '#ec4899', '#6366f1'];

export default function FixedAssetsByCategory() {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });

  const rows = data?.byCategory ?? [];
  const total = rows.reduce((s, r) => s + r.totalBookValue, 0);

  return (
    <div className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Aset per Kategori
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Distribusi nilai buku
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
          <PieIcon size={16} className="text-blue-600" />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <PieIcon size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Belum ada aset</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="totalBookValue"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {rows.map((r, i) => (
                    <Cell
                      key={r.category}
                      fill={COLOR_MAP[r.category] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => formatRupiah(Number(value))}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="w-full space-y-1.5 mt-2">
            {rows.map((r, i) => (
              <div key={r.category} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: COLOR_MAP[r.category] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }}
                />
                <span className="flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {r.category}
                  <span className="text-[10px] ml-1" style={{ color: 'var(--color-text-muted)' }}>
                    ({r.count} aset)
                  </span>
                </span>
                <span className="tabular-nums font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {formatRupiah(r.totalBookValue)}
                </span>
                <span className="tabular-nums text-[11px] w-10 text-right" style={{ color: 'var(--color-text-muted)' }}>
                  {total > 0 ? `${r.pct}%` : '0%'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
