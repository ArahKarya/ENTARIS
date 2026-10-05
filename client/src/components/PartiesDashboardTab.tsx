import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Wallet, Users, Store, CreditCard, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState } from '@/components/shared';

interface AgingBucket {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  over90: number;
}

interface TopParty {
  id: string;
  name: string;
  outstanding: number;
}

interface AgingInvoice {
  id: string;
  invoiceNumber: string;
  customerName?: string;
  supplierName?: string;
  outstanding: number;
  daysOverdue: number;
  dueDate: string;
}

interface RecentPayment {
  id: string;
  paymentNumber: string;
  date: string;
  paymentType: string;
  amount: number;
  partyName: string;
  accountName: string;
}

interface DashboardData {
  summary: {
    totalCustomers: number;
    totalSuppliers: number;
    totalPiutang: number;
    totalHutang: number;
    totalCustomerDeposit: number;
    totalVendorDeposit: number;
  };
  topCustomers: TopParty[];
  topVendors: TopParty[];
  agingPiutang: AgingBucket;
  agingPiutangInvoices: AgingInvoice[];
  agingHutang: AgingBucket;
  agingHutangInvoices: AgingInvoice[];
  recentPayments: RecentPayment[];
}

const AGING_LABELS = ['Belum Jatuh Tempo', '1-30 hari', '31-60 hari', '61-90 hari', '> 90 hari'];
const AGING_COLORS = ['bg-success', 'bg-warning', 'bg-warning/60', 'bg-danger/60', 'bg-danger'];

const PANEL = 'rounded-lg border border-border bg-card text-card-foreground shadow-[var(--shadow-1)]';

function AgingBar({ data, label }: { data: AgingBucket; label: string }) {
  const buckets = [data.current, data.d30, data.d60, data.d90, data.over90];
  const total = buckets.reduce((s, v) => s + v, 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h4>
        <span className="num text-sm font-semibold text-foreground">{formatRupiah(total)}</span>
      </div>
      {total > 0 ? (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {buckets.map((val, i) => {
              const pct = (val / total) * 100;
              if (pct < 0.5) return null;
              return (
                <div
                  key={i}
                  className={cn(AGING_COLORS[i], 'transition-all')}
                  style={{ width: `${pct}%` }}
                  title={`${AGING_LABELS[i]}: ${formatRupiah(val)}`}
                />
              );
            })}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {buckets.map((val, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('size-2 rounded-full', AGING_COLORS[i])} aria-hidden />
                <span>{AGING_LABELS[i]}</span>
                <span className="num font-medium text-foreground">{formatRupiah(val)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">Tidak ada data</p>
      )}
    </div>
  );
}

export default function PartiesDashboardTab() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['parties-dashboard'],
    queryFn: () => api.get('/parties/dashboard').then(r => r.data),
  });

  if (isLoading) return <LoadingState />;

  if (!data) return null;

  const { summary } = data;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KPICard icon={<Users size={16} />} label="Pelanggan Aktif" value={summary.totalCustomers.toString()} tone="primary" />
        <KPICard icon={<Store size={16} />} label="Vendor Aktif" value={summary.totalSuppliers.toString()} tone="info" />
        <KPICard icon={<TrendingUp size={16} />} label="Total Piutang" value={formatRupiah(summary.totalPiutang)} tone="danger" />
        <KPICard icon={<TrendingDown size={16} />} label="Total Hutang" value={formatRupiah(summary.totalHutang)} tone="warning" />
        <KPICard icon={<Wallet size={16} />} label="UM Pelanggan" value={formatRupiah(summary.totalCustomerDeposit)} tone="success" />
        <KPICard icon={<CreditCard size={16} />} label="UM Vendor" value={formatRupiah(summary.totalVendorDeposit)} tone="neutral" />
      </div>

      {/* Aging Piutang & Hutang */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cn(PANEL, 'p-5')}>
          <AgingBar data={data.agingPiutang} label="Aging Piutang" />
        </div>
        <div className={cn(PANEL, 'p-5')}>
          <AgingBar data={data.agingHutang} label="Aging Hutang" />
        </div>
      </div>

      {/* Top Customers & Vendors */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopList
          title="Top 10 Piutang Pelanggan"
          icon={<TrendingUp size={14} className="text-danger-text" aria-hidden />}
          items={data.topCustomers}
          barColor="bg-danger/60"
        />
        <TopList
          title="Top 10 Hutang Vendor"
          icon={<TrendingDown size={14} className="text-warning-text" aria-hidden />}
          items={data.topVendors}
          barColor="bg-warning/70"
        />
      </div>

      {/* Aging Invoices (Overdue) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OverdueTable title="Invoice Piutang Jatuh Tempo" invoices={data.agingPiutangInvoices} nameField="customerName" />
        <OverdueTable title="Invoice Hutang Jatuh Tempo" invoices={data.agingHutangInvoices} nameField="supplierName" />
      </div>

      {/* Recent Payments */}
      <section className={cn(PANEL, 'overflow-hidden')} aria-labelledby="parties-recent-payments">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Clock size={14} className="text-muted-foreground" aria-hidden />
          <h3 id="parties-recent-payments" className="text-sm font-semibold text-foreground">Pembayaran Terakhir</h3>
        </div>
        {data.recentPayments.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Belum ada pembayaran.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. Pembayaran</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Mitra</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Akun</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentPayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="num text-xs">{p.paymentNumber}</TableCell>
                  <TableCell>{formatDate(p.date)}</TableCell>
                  <TableCell className="font-medium">{p.partyName}</TableCell>
                  <TableCell>
                    <Badge variant={p.paymentType === 'Receive' ? 'success' : 'info'} className="uppercase">
                      {p.paymentType === 'Receive' ? 'Terima' : 'Bayar'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.accountName}</TableCell>
                  <TableCell className="num text-right font-medium">{formatRupiah(p.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

/* ---------- Sub-components ---------- */

type Tone = 'primary' | 'info' | 'danger' | 'warning' | 'success' | 'neutral';

const TONE_MAP: Record<Tone, { bg: string; text: string }> = {
  primary: { bg: 'bg-primary-subtle', text: 'text-primary-subtle-foreground' },
  info: { bg: 'bg-info-subtle', text: 'text-info-text' },
  danger: { bg: 'bg-danger-subtle', text: 'text-danger-text' },
  warning: { bg: 'bg-warning-subtle', text: 'text-warning-text' },
  success: { bg: 'bg-success-subtle', text: 'text-success-text' },
  neutral: { bg: 'bg-neutral-subtle', text: 'text-neutral-text' },
};

function KPICard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: Tone }) {
  const c = TONE_MAP[tone];
  return (
    <div className={cn('rounded-lg p-4', c.bg)}>
      <div className={cn('mb-2', c.text)} aria-hidden>{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('num mt-0.5 truncate text-lg font-bold', c.text)} title={value}>{value}</p>
    </div>
  );
}

function TopList({ title, icon, items, barColor }: { title: string; icon: React.ReactNode; items: TopParty[]; barColor: string }) {
  const maxVal = items.length > 0 ? items[0].outstanding : 1;

  return (
    <div className={cn(PANEL, 'p-5')}>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Tidak ada data</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((item, i) => {
            const pct = Math.max(5, (item.outstanding / maxVal) * 100);
            return (
              <li key={item.id}>
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="mr-2 truncate text-xs font-medium text-foreground">
                    <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                    {item.name}
                  </span>
                  <span className="num shrink-0 text-xs font-semibold text-foreground">
                    {formatRupiah(item.outstanding)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn(barColor, 'h-full rounded-full')} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function OverdueTable({ title, invoices, nameField }: { title: string; invoices: AgingInvoice[]; nameField: 'customerName' | 'supplierName' }) {
  return (
    <section className={cn(PANEL, 'overflow-hidden')} aria-label={title}>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <AlertTriangle size={14} className="text-warning-text" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {invoices.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Tidak ada invoice jatuh tempo.</div>
      ) : (
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Mitra</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Hari</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="num">{inv.invoiceNumber}</TableCell>
                <TableCell className="max-w-[120px] truncate font-medium">{inv[nameField]}</TableCell>
                <TableCell className="num text-right font-semibold">{formatRupiah(inv.outstanding)}</TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={inv.daysOverdue > 60 ? 'danger' : inv.daysOverdue > 30 ? 'warning' : 'success'}
                    className="num font-semibold"
                  >
                    {inv.daysOverdue}d
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
