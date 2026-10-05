import { useQuery } from '@tanstack/react-query';
import { PieChart } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { DonutBreakdown } from '../dashboard-kit/DonutBreakdown';

interface Props {
  startDate?: string;
  endDate?: string;
}

interface ExpenseRow {
  accountId: string;
  accountName: string;
  amount: number;
}

export default function ExpenseBreakdown({ startDate, endDate }: Props) {
  const { data, isLoading, isError, refetch } = useQuery<ExpenseRow[]>({
    queryKey: ['dashboard-expense-breakdown', startDate, endDate],
    queryFn: async () => (await api.get('/dashboard/expense-breakdown', { params: { startDate, endDate } })).data,
  });
  const rows = data ?? [];
  const total = rows.reduce((s, d) => s + d.amount, 0);

  return (
    <WidgetCard
      title="Beban per Akun"
      description="Pada periode terpilih"
      icon={PieChart}
      href="/reports/profit-loss"
      hrefLabel="Laba rugi"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={PieChart}
      emptyText="Belum ada data beban pada periode ini"
      minHeight={290}
    >
      <DonutBreakdown
        data={rows.map((r) => ({ key: r.accountId, label: r.accountName, value: r.amount }))}
        formatValue={(n) => formatRupiah(n, { compact: true })}
        summary={`Diagram donat beban per akun, total ${formatRupiah(total)}, ${rows.length} akun.`}
        caption="Beban per akun"
        valueHeader="Jumlah"
        legendLimit={5}
      />
    </WidgetCard>
  );
}
