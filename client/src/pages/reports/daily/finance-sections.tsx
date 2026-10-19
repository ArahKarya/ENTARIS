import { CreditCard, Package, Users, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReportDataTable, ReportMetricGrid, ReportSection, type DataColumn } from '@/components/report-kit';
import type { AgingRow, DailyData, DepositRow, PaymentLine } from './types';

const rp = (n: number) => formatRupiah(n);
const dash = (n: number) => (n > 0 ? rp(n) : '—');

type T = TFunction<'reports'>;

function paymentColumns(t: T, tone: 'in' | 'out'): DataColumn<PaymentLine>[] {
  return [
    { key: 'no', header: t('dailyReport.cols.no'), rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (p) => p.paymentNumber },
    { key: 'party', header: t('dailyReport.cols.party'), render: (p) => p.partyName },
    {
      key: 'amount',
      header: t('dailyReport.cols.amount'),
      numeric: true,
      className: cn('whitespace-nowrap', tone === 'in' ? 'text-success-text' : 'text-danger-text'),
      render: (p) => rp(p.amount),
    },
  ];
}

export function FinanceSection({ data }: { data: DailyData['finance'] }) {
  const { t } = useTranslation('reports');
  const s = data.summary;
  return (
    <ReportSection title={t('dailyReport.finance.title')} icon={Wallet}>
      <ReportMetricGrid
        label={t('dailyReport.finance.summary')}
        className="mb-4"
        items={[
          { label: t('dailyReport.finance.in'), value: rp(s.totalIn) },
          { label: t('dailyReport.finance.out'), value: rp(s.totalOut) },
          { label: t('dailyReport.finance.net'), value: formatRupiah(s.netCashFlow, { negative: 'parens' }), valueClassName: s.netCashFlow < 0 ? 'text-danger-text' : undefined },
          { label: t('dailyReport.finance.manualJournals'), value: data.manualJournals },
        ]}
      />

      <h3 className="mb-2 text-xs font-semibold text-foreground">{t('dailyReport.finance.cashBank')}</h3>
      <ul className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {data.cashBankBalances.map((cb) => (
          <li key={cb.accountNumber} className="rounded-lg border border-border bg-info-subtle px-3 py-2">
            <p className="text-xs font-medium text-info-text">{cb.accountNumber} · {cb.accountName}</p>
            <p className="num mt-0.5 text-sm font-semibold text-foreground">{formatRupiah(cb.balance, { negative: 'parens' })}</p>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-success-text">{t('dailyReport.finance.inCount', { count: data.paymentsIn.length })}</h3>
          <ReportDataTable caption={t('dailyReport.finance.inCaption')} columns={paymentColumns(t, 'in')} rows={data.paymentsIn} getRowKey={(p) => p.paymentNumber} maxHeightClass="max-h-80" />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold text-danger-text">{t('dailyReport.finance.outCount', { count: data.paymentsOut.length })}</h3>
          <ReportDataTable caption={t('dailyReport.finance.outCaption')} columns={paymentColumns(t, 'out')} rows={data.paymentsOut} getRowKey={(p) => p.paymentNumber} maxHeightClass="max-h-80" />
        </div>
      </div>
    </ReportSection>
  );
}

function agingColumns(t: T, party: 'customer' | 'supplier'): DataColumn<AgingRow>[] {
  return [
    { key: 'party', header: party === 'customer' ? t('dailyReport.cols.customer') : t('dailyReport.cols.supplier'), rowHeader: true, render: (r) => (party === 'customer' ? r.customerName : r.supplierName) },
    { key: 'cur', header: t('agingAnalysis.summary.current'), numeric: true, className: 'whitespace-nowrap', render: (r) => dash(r.current) },
    { key: 'd30', header: t('dailyReport.cols.d1'), numeric: true, className: 'whitespace-nowrap', render: (r) => dash(r.d1_30) },
    { key: 'd60', header: t('dailyReport.cols.d31'), numeric: true, className: 'whitespace-nowrap', render: (r) => dash(r.d31_60) },
    { key: 'd90', header: t('dailyReport.cols.d61'), numeric: true, className: 'whitespace-nowrap', render: (r) => dash(r.d61_90) },
    { key: 'd91', header: t('dailyReport.cols.d91'), numeric: true, className: 'whitespace-nowrap text-danger-text', render: (r) => dash(r.d91_plus) },
    { key: 'total', header: t('reportsShared.total'), numeric: true, className: 'whitespace-nowrap font-semibold', render: (r) => rp(r.total) },
  ];
}

export function ReceivablesSection({ data }: { data: DailyData['receivables'] }) {
  const { t } = useTranslation('reports');
  const s = data.summary;
  return (
    <ReportSection title={t('dailyReport.receivables.title')} icon={Users} count={s.totalCustomers}>
      <ReportMetricGrid
        label={t('dailyReport.receivables.summary')}
        className="mb-4 sm:grid-cols-3"
        items={[
          { label: t('receivableSchedule.summary.total'), value: rp(s.totalOutstanding) },
          { label: t('scheduleReport.status.overdue'), value: rp(s.totalOverdue) },
          { label: t('dailyReport.receivables.count'), value: s.totalCustomers },
        ]}
      />
      <ReportDataTable caption={t('dailyReport.receivables.caption')} columns={agingColumns(t, 'customer')} rows={data.byCustomer} getRowKey={(r) => r.customerName ?? ''} emptyText={t('dailyReport.receivables.empty')} maxHeightClass="max-h-96" />
    </ReportSection>
  );
}

export function PayablesSection({ data }: { data: DailyData['payables'] }) {
  const { t } = useTranslation('reports');
  const s = data.summary;
  return (
    <ReportSection title={t('dailyReport.payables.title')} icon={CreditCard} count={s.totalSuppliers}>
      <ReportMetricGrid
        label={t('dailyReport.payables.summary')}
        className="mb-4 sm:grid-cols-3"
        items={[
          { label: t('dailyReport.payables.total'), value: rp(s.totalOutstanding) },
          { label: t('scheduleReport.status.overdue'), value: rp(s.totalOverdue) },
          { label: t('dailyReport.payables.count'), value: s.totalSuppliers },
        ]}
      />
      <ReportDataTable caption={t('dailyReport.payables.caption')} columns={agingColumns(t, 'supplier')} rows={data.bySupplier} getRowKey={(r) => r.supplierName ?? ''} emptyText={t('dailyReport.payables.empty')} maxHeightClass="max-h-96" />
    </ReportSection>
  );
}

function depositColumns(t: T): DataColumn<DepositRow>[] {
  return [
    { key: 'no', header: t('dailyReport.deposits.cols.paymentNo'), rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (d) => d.paymentNumber },
    { key: 'supplier', header: t('dailyReport.cols.supplier'), render: (d) => d.supplierName },
    { key: 'amount', header: t('dailyReport.deposits.cols.amount'), numeric: true, className: 'whitespace-nowrap', render: (d) => rp(d.amount) },
    { key: 'applied', header: t('dailyReport.deposits.cols.applied'), numeric: true, className: 'whitespace-nowrap', render: (d) => rp(d.totalApplied) },
    { key: 'remaining', header: t('dailyReport.deposits.cols.remaining'), numeric: true, className: 'whitespace-nowrap font-semibold', render: (d) => rp(d.remaining) },
  ];
}

export function DepositsSection({ data }: { data: DailyData['vendorDeposits'] }) {
  const { t } = useTranslation('reports');
  const s = data.summary;
  return (
    <ReportSection title={t('dailyReport.deposits.title')} icon={Package} count={data.deposits.length}>
      <ReportMetricGrid
        label={t('dailyReport.deposits.summary')}
        className="mb-4 sm:grid-cols-3"
        items={[
          { label: t('dailyReport.deposits.total'), value: rp(s.totalDeposits) },
          { label: t('dailyReport.deposits.applied'), value: rp(s.totalApplied) },
          { label: t('dailyReport.deposits.remaining'), value: rp(s.totalRemaining) },
        ]}
      />
      <ReportDataTable caption={t('dailyReport.deposits.caption')} columns={depositColumns(t)} rows={data.deposits} getRowKey={(d) => d.paymentNumber} emptyText={t('dailyReport.deposits.empty')} maxHeightClass="max-h-96" />
    </ReportSection>
  );
}
