import { useQuery } from '@tanstack/react-query';
import { Wallet, Loader2, Landmark } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '../../lib/formatters';

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
  const { data, isLoading } = useQuery<CashPositionData>({
    queryKey: ['dashboard-cash-position'],
    queryFn: async () => (await api.get('/dashboard/cash-position')).data,
  });

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Posisi Kas &amp; Bank
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Saldo per akun
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
          <Wallet size={16} className="text-emerald-600" />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : data.accounts.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Landmark size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Belum ada akun kas/bank</p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {data.accounts.map((acc) => {
              const pct = data.total !== 0 ? Math.abs(acc.balance / data.total) * 100 : 0;
              return (
                <div key={acc.accountId}>
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-medium truncate pr-2"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <span className="text-xs font-mono mr-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        {acc.accountNumber}
                      </span>
                      {acc.name}
                    </span>
                    <span
                      className="text-xs font-semibold tabular-nums flex-shrink-0"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {formatRupiah(acc.balance)}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                  >
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="mt-4 pt-3 flex items-center justify-between border-t"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Total
            </span>
            <span className="text-base font-bold tabular-nums text-emerald-600">
              {formatRupiah(data.total)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
