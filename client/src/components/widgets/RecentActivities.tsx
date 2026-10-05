import { ArrowDownRight, ArrowUpRight, Activity } from 'lucide-react';
import { formatRupiah, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface Payment {
  id: string;
  paymentNumber: string;
  paymentType: string;
  date: string;
  amount: number;
}

interface RecentActivitiesProps {
  data: Payment[] | null;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export default function RecentActivities({ data, isLoading, isError, onRetry }: RecentActivitiesProps) {
  return (
    <WidgetCard
      title="Transaksi Kas Terakhir"
      icon={Activity}
      href="/payments"
      hrefLabel="Lihat semua"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      isEmpty={!data?.length}
      emptyIcon={Activity}
      emptyText="Belum ada transaksi"
    >
      <ul className="space-y-2.5">
        {(data ?? []).map((a) => {
          const receive = a.paymentType === 'Receive';
          const Icon = receive ? ArrowDownRight : ArrowUpRight;
          return (
            <li key={a.id} className="flex items-center gap-3">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', receive ? 'bg-success-subtle text-success-text' : 'bg-danger-subtle text-danger-text')}>
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{a.paymentNumber}</p>
                <p className="text-xs text-muted-foreground">{formatDate(a.date, 'short')} · {receive ? 'Masuk' : 'Keluar'}</p>
              </div>
              <span className={cn('num text-xs font-semibold', receive ? 'text-success-text' : 'text-danger-text')}>
                {receive ? '+' : '-'}{formatRupiah(a.amount, { symbol: false })}
              </span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
