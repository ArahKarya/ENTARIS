import { useMemo, useState } from 'react';
import {
  Plus, Search, Truck, ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/formatters';
import { useDebounce } from '../hooks/useDebounce';
import SearchableSelect, { type SelectOption } from '../components/SearchableSelect';
import TableRowSkeleton from '../components/TableRowSkeleton';
import DeliveryOrderModal from '../components/DeliveryOrderModal';
import DeliveryOrderDetailDrawer from '../components/DeliveryOrderDetailDrawer';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Submitted', label: 'Diserahkan' },
  { value: 'Invoiced', label: 'Sudah Diinvoice' },
  { value: 'Cancelled', label: 'Dibatalkan' },
];

const STATUS_BADGE: Record<string, string> = {
  Submitted: 'badge-blue',
  Invoiced: 'badge-green',
  Cancelled: 'badge-red',
};

const STATUS_LABEL: Record<string, string> = {
  Submitted: 'Diserahkan',
  Invoiced: 'Sudah Diinvoice',
  Cancelled: 'Dibatalkan',
};

const PAGE_SIZE = 25;

export const DeliveryOrders = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);
  const [statusFilter, setStatusFilter] = useState('');
  const [partyId, setPartyId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: parties } = useQuery({
    queryKey: ['parties-customers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Customer');
      return res.data.data ?? res.data;
    },
  });

  const partyOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: '— Semua Pelanggan —' },
      ...((parties ?? []).map((p: any) => ({ value: p.id, label: p.name })) as SelectOption[]),
    ],
    [parties],
  );

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['delivery-orders'],
    queryFn: async () => {
      const res = await api.get('/delivery-orders?limit=200');
      return res.data.data ?? res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!raw) return [];
    return (raw as any[]).filter((d: any) => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const match =
          d.doNumber?.toLowerCase().includes(q) ||
          d.customer?.name?.toLowerCase().includes(q) ||
          d.party?.name?.toLowerCase().includes(q) ||
          d.nomorMobil?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statusFilter && d.status !== statusFilter) return false;
      if (partyId && d.partyId !== partyId && d.customer?.id !== partyId) return false;
      if (dateFrom && new Date(d.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(d.date) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [raw, debouncedSearch, statusFilter, partyId, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasActiveFilter = !!(searchTerm || statusFilter || partyId || dateFrom || dateTo);

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setPartyId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Surat Jalan</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Dokumen pengiriman fisik ke pelanggan. Stok keluar di sini, invoice menyusul.
          </p>
        </div>
        <button className="btn-primary self-start" onClick={() => setIsModalOpen(true)}>
          <Plus size={15} /> Buat Surat Jalan
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap filter-bar">
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nomor DO, pelanggan, no. mobil..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="w-56">
          <SearchableSelect
            options={partyOptions}
            value={partyId}
            onChange={(v) => { setPartyId(v); setPage(1); }}
            placeholder="— Semua Pelanggan —"
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span className="text-xs">Dari</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg py-2 px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs">s/d</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg py-2 px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {hasActiveFilter && (
          <button onClick={resetFilters} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            Reset filter
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">Nomor DO</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">No. Mobil</th>
                <th scope="col" className="text-center">Items</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableRowSkeleton columns={7} rows={6} />
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-2" />
                    <p className="text-sm text-red-500">Gagal memuat daftar surat jalan.</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Truck className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">
                      {raw && (raw as any[]).length === 0
                        ? 'Belum ada surat jalan.'
                        : 'Tidak ada surat jalan sesuai filter.'}
                    </p>
                    {raw && (raw as any[]).length === 0 && (
                      <button
                        onClick={() => setIsModalOpen(true)}
                        className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        + Buat surat jalan pertama
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map((d: any) => {
                  const customer = d.customer ?? d.party;
                  const invoiceRef = d.salesInvoice ?? d.invoice;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className="cursor-pointer"
                    >
                      <td className="text-gray-500 whitespace-nowrap">{formatDate(d.date)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{d.doNumber}</span>
                      </td>
                      <td>
                        <p className="font-medium text-gray-800">{customer?.name ?? '—'}</p>
                        {customer?.phone && <p className="text-xs text-gray-400">{customer.phone}</p>}
                      </td>
                      <td className="font-mono text-xs text-gray-600 uppercase whitespace-nowrap">
                        {d.nomorMobil || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center">
                        <span className="badge badge-gray text-xs">{d._count?.items ?? d.items?.length ?? 0} item</span>
                      </td>
                      <td className="text-center">
                        <span className={cn('badge', STATUS_BADGE[d.status] ?? 'badge-gray')}>
                          {STATUS_LABEL[d.status] ?? d.status}
                        </span>
                      </td>
                      <td>
                        {invoiceRef ? (
                          <span className="font-mono text-xs text-green-700">{invoiceRef.invoiceNumber}</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400">
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length} surat jalan
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-500 px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Conditional render — parent controls lifecycle so state resets cleanly on each open. */}
      {isModalOpen && (
        <DeliveryOrderModal onClose={() => setIsModalOpen(false)} />
      )}

      <DeliveryOrderDetailDrawer
        doId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
};

export default DeliveryOrders;
