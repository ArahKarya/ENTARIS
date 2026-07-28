import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, TrendingDown, Wallet, Users, Store, CreditCard, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';

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
const AGING_COLORS = ['bg-green-500', 'bg-yellow-400', 'bg-orange-400', 'bg-red-400', 'bg-red-600'];

function AgingBar({ data, label }: { data: AgingBucket; label: string }) {
  const buckets = [data.current, data.d30, data.d60, data.d90, data.over90];
  const total = buckets.reduce((s, v) => s + v, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</h4>
        <span className="text-sm font-semibold text-gray-700">{formatRupiah(total)}</span>
      </div>
      {total > 0 ? (
        <>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {buckets.map((val, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={cn('w-2 h-2 rounded-full', AGING_COLORS[i])} />
                <span>{AGING_LABELS[i]}</span>
                <span className="font-mono font-medium text-gray-600">{formatRupiah(val)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400 italic">Tidak ada data</p>
      )}
    </div>
  );
}

export default function PartiesDashboardTab() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['parties-dashboard'],
    queryFn: () => api.get('/parties/dashboard').then(r => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          icon={<Users size={16} />}
          label="Pelanggan Aktif"
          value={summary.totalCustomers.toString()}
          color="blue"
        />
        <KPICard
          icon={<Store size={16} />}
          label="Vendor Aktif"
          value={summary.totalSuppliers.toString()}
          color="orange"
        />
        <KPICard
          icon={<TrendingUp size={16} />}
          label="Total Piutang"
          value={formatRupiah(summary.totalPiutang)}
          color="red"
        />
        <KPICard
          icon={<TrendingDown size={16} />}
          label="Total Hutang"
          value={formatRupiah(summary.totalHutang)}
          color="purple"
        />
        <KPICard
          icon={<Wallet size={16} />}
          label="UM Pelanggan"
          value={formatRupiah(summary.totalCustomerDeposit)}
          color="teal"
        />
        <KPICard
          icon={<CreditCard size={16} />}
          label="UM Vendor"
          value={formatRupiah(summary.totalVendorDeposit)}
          color="amber"
        />
      </div>

      {/* Aging Piutang & Hutang */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <AgingBar data={data.agingPiutang} label="Aging Piutang" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <AgingBar data={data.agingHutang} label="Aging Hutang" />
        </div>
      </div>

      {/* Top Customers & Vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopList
          title="Top 10 Piutang Pelanggan"
          icon={<TrendingUp size={14} className="text-red-500" />}
          items={data.topCustomers}
          color="red"
        />
        <TopList
          title="Top 10 Hutang Vendor"
          icon={<TrendingDown size={14} className="text-purple-500" />}
          items={data.topVendors}
          color="purple"
        />
      </div>

      {/* Aging Invoices (Overdue) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OverdueTable
          title="Invoice Piutang Jatuh Tempo"
          invoices={data.agingPiutangInvoices}
          nameField="customerName"
        />
        <OverdueTable
          title="Invoice Hutang Jatuh Tempo"
          invoices={data.agingHutangInvoices}
          nameField="supplierName"
        />
      </div>

      {/* Recent Payments */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Pembayaran Terakhir</h3>
        </div>
        {data.recentPayments.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Belum ada pembayaran.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">No. Pembayaran</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tanggal</th>
                  <th className="text-left px-4 py-2.5 font-medium">Mitra</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tipe</th>
                  <th className="text-left px-4 py-2.5 font-medium">Akun</th>
                  <th className="text-right px-4 py-2.5 font-medium">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{p.paymentNumber}</td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDate(p.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{p.partyName}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'text-xs font-semibold uppercase px-1.5 py-0.5 rounded',
                        p.paymentType === 'Receive' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                      )}>
                        {p.paymentType === 'Receive' ? 'Terima' : 'Bayar'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{p.accountName}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-800 tabular-nums">
                      {formatRupiah(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

const COLOR_MAP: Record<string, { bg: string; text: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-500' },
  red: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', icon: 'text-teal-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500' },
};

function KPICard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.blue;
  return (
    <div className={cn('rounded-xl p-4 border', c.bg, 'border-transparent')}>
      <div className={cn('mb-2', c.icon)}>{icon}</div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={cn('text-lg font-bold font-mono tabular-nums mt-0.5 truncate', c.text)}>{value}</p>
    </div>
  );
}

function TopList({ title, icon, items, color }: { title: string; icon: React.ReactNode; items: TopParty[]; color: string }) {
  const barColor = color === 'red' ? 'bg-red-400' : 'bg-purple-400';
  const maxVal = items.length > 0 ? items[0].outstanding : 1;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Tidak ada data</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item, i) => {
            const pct = Math.max(5, (item.outstanding / maxVal) * 100);
            return (
              <div key={item.id}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-gray-700 font-medium truncate mr-2">
                    <span className="text-gray-400 mr-1">{i + 1}.</span>
                    {item.name}
                  </span>
                  <span className="text-xs font-mono font-semibold text-gray-600 tabular-nums shrink-0">
                    {formatRupiah(item.outstanding)}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cn(barColor, 'h-full rounded-full')} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OverdueTable({ title, invoices, nameField }: { title: string; invoices: AgingInvoice[]; nameField: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      {invoices.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-400">Tidak ada invoice jatuh tempo.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-4 py-2 font-medium">Invoice</th>
                <th className="text-left px-4 py-2 font-medium">Mitra</th>
                <th className="text-right px-4 py-2 font-medium">Outstanding</th>
                <th className="text-right px-4 py-2 font-medium">Hari</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-2 font-mono text-gray-700">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2 text-gray-700 font-medium truncate max-w-[120px]">
                    {(inv as any)[nameField]}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800 tabular-nums">
                    {formatRupiah(inv.outstanding)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={cn(
                      'font-semibold tabular-nums px-1.5 py-0.5 rounded',
                      inv.daysOverdue > 90 ? 'text-red-700 bg-red-50' :
                      inv.daysOverdue > 60 ? 'text-orange-700 bg-orange-50' :
                      inv.daysOverdue > 30 ? 'text-yellow-700 bg-yellow-50' :
                      'text-green-700 bg-green-50'
                    )}>
                      {inv.daysOverdue}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
