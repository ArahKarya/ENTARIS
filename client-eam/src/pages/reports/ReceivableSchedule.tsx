import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { cn } from '../../lib/utils';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  date: string;
  dueDate: string | null;
  grandTotal: number;
  outstanding: number;
  daysUntilDue: number | null;
  status: 'overdue' | 'due_soon' | 'on_track' | 'no_due_date';
}

interface ScheduleData {
  invoices: Invoice[];
  summary: { totalOutstanding: number; overdueAmount: number; totalInvoices: number };
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const statusConfig = {
  overdue: { label: 'Jatuh Tempo', badge: 'badge-red' },
  due_soon: { label: 'Segera', badge: 'badge-yellow' },
  on_track: { label: 'On Track', badge: 'badge-green' },
  no_due_date: { label: 'Tanpa JT', badge: 'badge-gray' },
};

export default function ReceivableSchedule() {
  const { data, isLoading } = useQuery<ScheduleData>({
    queryKey: ['receivable-schedule'],
    queryFn: async () => (await api.get('/reports/receivable-schedule')).data,
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/reports" className="p-1.5 hover:bg-gray-100 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Jadwal Piutang (AR)</h1>
      </div>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Piutang</p>
            <p className="text-lg font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(data.summary.totalOutstanding)}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{data.summary.totalInvoices} invoice</p>
          </div>
          <div className="card p-4 border-l-4 border-red-500">
            <p className="text-xs font-medium text-red-600">Jatuh Tempo</p>
            <p className="text-lg font-bold mt-1 text-red-600">Rp {fmt(data.summary.overdueAmount)}</p>
          </div>
          <div className="card p-4 border-l-4 border-green-500">
            <p className="text-xs font-medium text-green-600">On Track</p>
            <p className="text-lg font-bold mt-1 text-green-600">Rp {fmt(data.summary.totalOutstanding - data.summary.overdueAmount)}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Memuat...</div>
      ) : data && data.invoices.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No. Invoice</th>
                  <th>Pelanggan</th>
                  <th>Tanggal</th>
                  <th>Jatuh Tempo</th>
                  <th className="text-right">Outstanding</th>
                  <th>Hari</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => {
                  const cfg = statusConfig[inv.status];
                  return (
                    <tr key={inv.id}>
                      <td className="font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                      <td>{inv.customerName}</td>
                      <td className="text-xs">{fmtDate(inv.date)}</td>
                      <td className="text-xs">{fmtDate(inv.dueDate)}</td>
                      <td className="text-right tabular-nums font-medium">Rp {fmt(inv.outstanding)}</td>
                      <td className={cn('text-center tabular-nums text-xs font-medium',
                        inv.daysUntilDue !== null && inv.daysUntilDue < 0 ? 'text-red-600' :
                        inv.daysUntilDue !== null && inv.daysUntilDue <= 7 ? 'text-amber-600' : ''
                      )}>
                        {inv.daysUntilDue !== null ? (inv.daysUntilDue < 0 ? `${Math.abs(inv.daysUntilDue)}d lewat` : `${inv.daysUntilDue}d`) : '-'}
                      </td>
                      <td><span className={cn('badge', cfg.badge)}>{cfg.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Tidak ada piutang outstanding.</div>
      )}
    </div>
  );
}
