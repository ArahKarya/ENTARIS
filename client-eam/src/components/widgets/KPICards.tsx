import React from 'react';
import { Wallet, TrendingUp, TrendingDown, CreditCard, Package, Loader2, HandCoins } from 'lucide-react';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const MetricCard: React.FC<{ title: string; value: number; icon: React.ElementType; loading?: boolean }> = ({
  title,
  value,
  icon: Icon,
  loading,
}) => (
  <div
    className="border rounded-xl p-5"
    style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
  >
    <div className="flex items-center justify-between mb-4">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </span>
      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
        <Icon size={16} className="text-blue-600" />
      </div>
    </div>
    {loading ? (
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
    ) : (
      <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
        {formatRupiah(value)}
      </p>
    )}
  </div>
);

interface KPICardsProps {
  data: {
    cashBalance: number;
    accountsReceivable: number;
    accountsPayable: number;
    vendorDeposit: number;
    inventoryValue: number;
    netProfit: number;
  } | null;
  loading: boolean;
}

const KPICards: React.FC<KPICardsProps> = ({ data, loading }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <MetricCard title="Total Kas & Bank" value={data?.cashBalance ?? 0} loading={loading} icon={Wallet} />
    <MetricCard title="Piutang Usaha" value={data?.accountsReceivable ?? 0} loading={loading} icon={TrendingUp} />
    <MetricCard title="Hutang Usaha" value={data?.accountsPayable ?? 0} loading={loading} icon={TrendingDown} />
    <MetricCard title="Deposit Supplier" value={data?.vendorDeposit ?? 0} loading={loading} icon={HandCoins} />
    <MetricCard title="Nilai Persediaan" value={data?.inventoryValue ?? 0} loading={loading} icon={Package} />
    <MetricCard title="Laba Bersih (Bulan Ini)" value={data?.netProfit ?? 0} loading={loading} icon={CreditCard} />
  </div>
);

export default KPICards;
