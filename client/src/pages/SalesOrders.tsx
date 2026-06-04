import { useState, useMemo } from 'react';
import api from '../lib/api';
import { Plus, Search, FileText, Truck, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { formatRupiah, formatDate } from '../lib/formatters';
import SalesOrderModal from '../components/SalesOrderModal';
import SalesOrderDetailDrawer from '../components/SalesOrderDetailDrawer';
import TableRowSkeleton from '../components/TableRowSkeleton';
import { useDebounce } from '../hooks/useDebounce';
import Select from '../components/Select';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Submitted', label: 'Disubmit' },
  { value: 'PartiallyDelivered', label: 'Sebagian Terkirim' },
  { value: 'FullyDelivered', label: 'Selesai Dikirim' },
  { value: 'Cancelled', label: 'Dibatalkan' },
];

const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft',
  Submitted: 'Disubmit',
  PartiallyDelivered: 'Sebagian',
  FullyDelivered: 'Selesai',
  Cancelled: 'Dibatalkan',
};

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-gray',
  Submitted: 'badge-blue',
  PartiallyDelivered: 'badge-yellow',
  FullyDelivered: 'badge-green',
  Cancelled: 'badge-gray',
};

const PAGE_SIZE = 20;

export const SalesOrders = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: async () => {
      const res = await api.get('/sales-orders?limit=200');
      return res.data.data ?? res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!raw) return [];
    return raw.filter((s: any) => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const match = s.soNumber?.toLowerCase().includes(q) || s.customer?.name?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statusFilter && s.status !== statusFilter) return false;
      if (dateFrom && new Date(s.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(s.date) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [raw, debouncedSearch, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    if (!raw) return { total: 0, submitted: 0, partial: 0, fully: 0, totalValue: 0 };
    let submitted = 0, partial = 0, fully = 0, totalValue = 0;
    for (const s of raw) {
      if (s.status === 'Cancelled') continue;
      totalValue += Number(s.grandTotal);
      if (s.status === 'Submitted') submitted++;
      else if (s.status === 'PartiallyDelivered') partial++;
      else if (s.status === 'FullyDelivered') fully++;
    }
    return { total: raw.filter((s: any) => s.status !== 'Cancelled').length, submitted, partial, fully, totalValue };
  }, [raw]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pesanan Penjualan (SO)</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Komitmen jual sebelum Surat Jalan + Invoice. Cocok untuk skema "invoice dulu, kirim barang nanti".</p>
        </div>
        <button className="btn-primary self-start" onClick={() => { setEditTarget(null); setIsModalOpen(true); }}>
          <Plus size={15} /> Buat Pesanan
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><FileText size={16} className="text-blue-600" /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Aktif</p>
              <p className="text-lg font-bold text-foreground">{summary.total}</p>
              <p className="text-[11px] text-muted-foreground">{formatRupiah(summary.totalValue)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Clock size={16} className="text-blue-600" /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Disubmit</p>
              <p className="text-lg font-bold text-foreground">{summary.submitted}</p>
              <p className="text-[11px] text-muted-foreground">menunggu kirim</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg"><Truck size={16} className="text-amber-600" /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sebagian</p>
              <p className="text-lg font-bold text-foreground">{summary.partial}</p>
              <p className="text-[11px] text-muted-foreground">partial delivery</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 size={16} className="text-green-600" /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Selesai</p>
              <p className="text-lg font-bold text-foreground">{summary.fully}</p>
              <p className="text-[11px] text-muted-foreground">fully delivered</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari nomor / pelanggan..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-44"
        >
          {STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </Select>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="text-xs">Dari</span>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="border border-border rounded-lg py-2 px-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs">s/d</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="border border-border rounded-lg py-2 px-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {(searchTerm || statusFilter || dateFrom || dateTo) && (
          <button onClick={() => { setSearchTerm(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            Reset filter
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>No. SO</th>
                <th>Pelanggan</th>
                <th>Target Kirim</th>
                <th className="text-right">Grand Total</th>
                <th className="text-center">Status</th>
                <th className="text-center">SJ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableRowSkeleton columns={7} rows={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-muted-foreground">{raw?.length === 0 ? 'Belum ada SO.' : 'Tidak ada SO sesuai filter.'}</p>
                    {raw?.length === 0 && (
                      <button onClick={() => { setEditTarget(null); setIsModalOpen(true); }} className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium">
                        + Buat SO pertama
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map((s: any) => (
                  <tr key={s.id} onClick={() => setSelectedId(s.id)} className="cursor-pointer">
                    <td className="text-muted-foreground whitespace-nowrap">{formatDate(s.date)}</td>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">{s.soNumber}</span>
                    </td>
                    <td>
                      <p className="font-medium text-foreground">{s.customer?.name ?? '—'}</p>
                      {s.customerRefNo && <p className="text-xs text-muted-foreground">Ref: {s.customerRefNo}</p>}
                    </td>
                    <td className="whitespace-nowrap text-sm text-muted-foreground">{s.expectedDelivery ? formatDate(s.expectedDelivery) : '—'}</td>
                    <td className="text-right font-mono font-medium text-foreground tabular-nums">{formatRupiah(Number(s.grandTotal))}</td>
                    <td className="text-center">
                      <span className={cn('badge', STATUS_BADGE[s.status] ?? 'badge-gray')}>{STATUS_LABEL[s.status] ?? s.status}</span>
                    </td>
                    <td className="text-center text-xs text-muted-foreground">{s._count?.deliveryOrders ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{filtered.length} SO ditemukan</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs px-2 py-1 disabled:opacity-40">‹</button>
            <span className="text-xs">Hal {page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary text-xs px-2 py-1 disabled:opacity-40">›</button>
          </div>
        </div>
      )}

      <SalesOrderModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditTarget(null); }}
        editTarget={editTarget}
      />

      <SalesOrderDetailDrawer
        soId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(s) => {
          setSelectedId(null);
          setEditTarget(s);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
};

export default SalesOrders;
