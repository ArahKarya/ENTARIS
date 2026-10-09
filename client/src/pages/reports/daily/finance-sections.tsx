import { CreditCard, Package, Users, Wallet } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReportDataTable, ReportMetricGrid, ReportSection, type DataColumn } from '@/components/report-kit';
import type { AgingRow, DailyData, DepositRow, PaymentLine } from './types';

const rp = (n: number) => formatRupiah(n);
const dash = (n: number) => (n > 0 ? rp(n) : '—');

function paymentColumns(tone: 'in' | 'out'): DataColumn<PaymentLine>[] {
  return [
    { key: 'no', header: 'No.', rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (p) => p.paymentNumber },
    { key: 'party', header: 'Pihak', render: (p) => p.partyName },
    {
      key: 'amount',
      header: 'Jumlah',
      numeric: true,
      className: cn('whitespace-nowrap', tone === 'in' ? 'text-success-text' : 'text-danger-text'),
      render: (p) => rp(p.amount),
    },
  ];
}

const IN_COLUMNS = paymentColumns('in');
const OUT_COLUMNS = paymentColumns('out');

export function FinanceSection({ data }: { data: DailyData['finance'] }) {
  const s = data.summary;
  return (
    <ReportSection title="Keuangan" icon={Wallet}>
      <ReportMetricGrid
        label="Ringkasan keuangan"
        className="mb-4"
        items={[
          { label: 'Penerimaan', value: rp(s.totalIn) },
          { label: 'Pengeluaran', value: rp(s.totalOut) },
          { label: 'Arus Kas Bersih', value: formatRupiah(s.netCashFlow, { negative: 'parens' }), valueClassName: s.netCashFlow < 0 ? 'text-danger-text' : undefined },
          { label: 'Jurnal Manual', value: data.manualJournals },
        ]}
      />

      <h3 className="mb-2 text-xs font-semibold text-foreground">Saldo Kas &amp; Bank</h3>
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
          <h3 className="mb-2 text-xs font-semibold text-success-text">Penerimaan ({data.paymentsIn.length})</h3>
          <ReportDataTable caption="Penerimaan kas hari ini" columns={IN_COLUMNS} rows={data.paymentsIn} getRowKey={(p) => p.paymentNumber} maxHeightClass="max-h-80" />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold text-danger-text">Pengeluaran ({data.paymentsOut.length})</h3>
          <ReportDataTable caption="Pengeluaran kas hari ini" columns={OUT_COLUMNS} rows={data.paymentsOut} getRowKey={(p) => p.paymentNumber} maxHeightClass="max-h-80" />
        </div>
      </div>
    </ReportSection>
  );
}

function agingColumns(party: 'customer' | 'supplier'): DataColumn<AgingRow>[] {
  return [
    { key: 'party', header: party === 'customer' ? 'Pelanggan' : 'Supplier', rowHeader: true, render: (r) => (party === 'customer' ? r.customerName : r.supplierName) },
    { key: 'cur', header: 'Belum Jatuh Tempo', numeric: true, className: 'whitespace-nowrap', render: (r) => dash(r.current) },
    { key: 'd30', header: '1-30 hari', numeric: true, className: 'whitespace-nowrap', render: (r) => dash(r.d1_30) },
    { key: 'd60', header: '31-60 hari', numeric: true, className: 'whitespace-nowrap', render: (r) => dash(r.d31_60) },
    { key: 'd90', header: '61-90 hari', numeric: true, className: 'whitespace-nowrap', render: (r) => dash(r.d61_90) },
    { key: 'd91', header: '>90 hari', numeric: true, className: 'whitespace-nowrap text-danger-text', render: (r) => dash(r.d91_plus) },
    { key: 'total', header: 'Total', numeric: true, className: 'whitespace-nowrap font-semibold', render: (r) => rp(r.total) },
  ];
}

const AR_COLUMNS = agingColumns('customer');
const AP_COLUMNS = agingColumns('supplier');

export function ReceivablesSection({ data }: { data: DailyData['receivables'] }) {
  const s = data.summary;
  return (
    <ReportSection title="Piutang Usaha" icon={Users} count={s.totalCustomers}>
      <ReportMetricGrid
        label="Ringkasan piutang"
        className="mb-4 sm:grid-cols-3"
        items={[
          { label: 'Total Piutang', value: rp(s.totalOutstanding) },
          { label: 'Jatuh Tempo', value: rp(s.totalOverdue) },
          { label: 'Jumlah Pelanggan', value: s.totalCustomers },
        ]}
      />
      <ReportDataTable caption="Umur piutang per pelanggan" columns={AR_COLUMNS} rows={data.byCustomer} getRowKey={(r) => r.customerName ?? ''} emptyText="Tidak ada piutang" maxHeightClass="max-h-96" />
    </ReportSection>
  );
}

export function PayablesSection({ data }: { data: DailyData['payables'] }) {
  const s = data.summary;
  return (
    <ReportSection title="Hutang Usaha" icon={CreditCard} count={s.totalSuppliers}>
      <ReportMetricGrid
        label="Ringkasan hutang"
        className="mb-4 sm:grid-cols-3"
        items={[
          { label: 'Total Hutang', value: rp(s.totalOutstanding) },
          { label: 'Jatuh Tempo', value: rp(s.totalOverdue) },
          { label: 'Jumlah Supplier', value: s.totalSuppliers },
        ]}
      />
      <ReportDataTable caption="Umur hutang per supplier" columns={AP_COLUMNS} rows={data.bySupplier} getRowKey={(r) => r.supplierName ?? ''} emptyText="Tidak ada hutang" maxHeightClass="max-h-96" />
    </ReportSection>
  );
}

const DEPOSIT_COLUMNS: DataColumn<DepositRow>[] = [
  { key: 'no', header: 'No. Pembayaran', rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (d) => d.paymentNumber },
  { key: 'supplier', header: 'Supplier', render: (d) => d.supplierName },
  { key: 'amount', header: 'Jumlah Deposit', numeric: true, className: 'whitespace-nowrap', render: (d) => rp(d.amount) },
  { key: 'applied', header: 'Dialokasi', numeric: true, className: 'whitespace-nowrap', render: (d) => rp(d.totalApplied) },
  { key: 'remaining', header: 'Sisa', numeric: true, className: 'whitespace-nowrap font-semibold', render: (d) => rp(d.remaining) },
];

export function DepositsSection({ data }: { data: DailyData['vendorDeposits'] }) {
  const s = data.summary;
  return (
    <ReportSection title="Deposit Supplier" icon={Package} count={data.deposits.length}>
      <ReportMetricGrid
        label="Ringkasan deposit supplier"
        className="mb-4 sm:grid-cols-3"
        items={[
          { label: 'Total Deposit', value: rp(s.totalDeposits) },
          { label: 'Sudah Dialokasi', value: rp(s.totalApplied) },
          { label: 'Sisa Belum Dialokasi', value: rp(s.totalRemaining) },
        ]}
      />
      <ReportDataTable caption="Deposit supplier" columns={DEPOSIT_COLUMNS} rows={data.deposits} getRowKey={(d) => d.paymentNumber} emptyText="Tidak ada deposit supplier" maxHeightClass="max-h-96" />
    </ReportSection>
  );
}
