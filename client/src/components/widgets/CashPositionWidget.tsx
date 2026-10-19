import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Landmark, Wallet } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface CashAccount {
  accountId: string;
  accountNumber: string;
  name: string;
  balance: number;
}

interface CashPositionData {
  accounts: CashAccount[];
  total: number;
}

export default function CashPositionWidget() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<CashPositionData>({
    queryKey: ['dashboard-cash-position'],
    queryFn: async () => (await api.get('/dashboard/cash-position')).data,
  });

  return (
    <WidgetCard
      title={t('cashPosition.title')}
      description={t('cashPosition.description')}
      icon={Wallet}
      href="/payments"
      hrefLabel={t('cashPosition.transactions')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.accounts.length === 0}
      emptyIcon={Landmark}
      emptyText={t('cashPosition.empty')}
      minHeight={160}
    >
      {data && (
        <>
          <ul className="space-y-3">
            {data.accounts.map((acc) => {
              const pct = data.total !== 0 ? Math.abs(acc.balance / data.total) * 100 : 0;
              return (
                <li key={acc.accountId}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium text-foreground">
                      <span className="mr-1.5 font-mono text-muted-foreground">{acc.accountNumber}</span>
                      {acc.name}
                    </span>
                    <span className="num shrink-0 text-xs font-semibold text-foreground">{formatRupiah(acc.balance, { negative: 'parens' })}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-sm bg-muted" aria-hidden>
                    <div className="h-full rounded-sm bg-chart-3" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('widgetsShared.total')}</span>
            <span className="num text-base font-semibold text-foreground">{formatRupiah(data.total, { negative: 'parens' })}</span>
          </div>
        </>
      )}
    </WidgetCard>
  );
}
