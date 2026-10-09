import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface CashFlowData {
  days: { date: string; cashIn: number; cashOut: number }[];
  totalIn: number;
  totalOut: number;
  net: number;
}

interface CashFlowProps {
  startDate?: string;
  endDate?: string;
}

export default function CashFlowChart({ startDate, endDate }: CashFlowProps = {}) {
  const { data, isLoading, isError, refetch } = useQuery<CashFlowData>({
    queryKey: ['dashboard-cash-flow', startDate, endDate],
    queryFn: async () => (await api.get('/dashboard/cash-flow', { params: { startDate, endDate } })).data,
  });

  const rows = data
    ? [
        { label: 'Kas Masuk', value: data.totalIn, Icon: ArrowDownCircle, tone: 'text-success-text' },
        { label: 'Kas Keluar', value: data.totalOut, Icon: ArrowUpCircle, tone: 'text-danger-text' },
        { label: 'Arus Kas Bersih', value: data.net, Icon: Wallet, tone: data.net >= 0 ? 'text-success-text' : 'text-danger-text', strong: true },
      ]
    : [];

  return (
    <WidgetCard
      title="Kas masuk vs keluar"
      description="Pada periode terpilih"
      icon={Wallet}
      href="/reports/cash-flow"
      hrefLabel="Laporan"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      minHeight={190}
    >
      <ul className="space-y-2">
        {rows.map(({ label, value, Icon, tone, strong }) => (
          <li
            key={label}
            className={cn('flex items-center gap-3 rounded-md bg-muted/50 p-3', strong && 'border border-border-strong')}
          >
            <Icon className={cn('size-[18px] shrink-0', tone)} aria-hidden />
            <span className="flex-1 text-xs font-medium text-muted-foreground">{label}</span>
            <span className={cn('num text-sm font-semibold', tone)}>{formatRupiah(value, { negative: 'parens' })}</span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
