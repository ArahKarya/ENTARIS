import { useQuery } from '@tanstack/react-query';
import { Building2, TrendingDown, Wallet, Layers, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '../../lib/formatters';

interface SummaryData {
  count: number;
  totalCost: number;
  totalAccumulated: number;
  totalBookValue: number;
  depreciationThisMonth: number;
  depreciationThisMonthEntries: number;
  depreciationYTD: number;
}

interface ApiResponse {
  summary: SummaryData;
}

const KpiCard = ({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent: 'blue' | 'amber' | 'emerald' | 'purple';
}) => {
  const accentBg = {
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600',
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600',
    purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
  }[accent];
  return (
    <div
      className="border rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accentBg}`}>
          <Icon size={15} />
        </div>
      </div>
      <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>
      )}
    </div>
  );
};

export default function FixedAssetsKPI() {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });

  if (isLoading || !data) {
    return (
      <div className="border rounded-xl p-8 flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
        <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
      </div>
    );
  }

  const s = data.summary;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        icon={Layers}
        label="Total Aset"
        value={s.count.toLocaleString('id-ID')}
        sub="entitas aset tetap aktif"
        accent="blue"
      />
      <KpiCard
        icon={Building2}
        label="Harga Perolehan"
        value={formatRupiah(s.totalCost)}
        sub="akumulasi nilai beli"
        accent="purple"
      />
      <KpiCard
        icon={TrendingDown}
        label="Akumulasi Penyusutan"
        value={formatRupiah(s.totalAccumulated)}
        sub={s.depreciationYTD > 0 ? `YTD: ${formatRupiah(s.depreciationYTD)}` : 'belum ada posting YTD'}
        accent="amber"
      />
      <KpiCard
        icon={Wallet}
        label="Nilai Buku Bersih"
        value={formatRupiah(s.totalBookValue)}
        sub={s.totalCost > 0 ? `${((s.totalBookValue / s.totalCost) * 100).toFixed(1)}% dari harga beli` : '—'}
        accent="emerald"
      />
    </div>
  );
}
